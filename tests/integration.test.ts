import { mkdtemp, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { pool, transaction } from "../source/server/db";
import {
  generateBilling,
  postPayment,
  reversePayment,
  ledger,
} from "../source/server/finance";
import { buildApp } from "../source/server/app";
import { hashPassword } from "../source/server/auth";
import { rolePermissions } from "../source/shared/domain";
const enabled = process.env.RUN_DB_TESTS === "1";
describe.skipIf(!enabled)("PostgreSQL + authenticated API acceptance", () => {
  let app: Awaited<ReturnType<typeof buildApp>>,
    owner: number,
    token: string,
    cashToken: string,
    adminToken: string;
  let serial = 0;
  const headers = () => ({ authorization: `Bearer ${token}` });
  async function fixture(rates = [99900]) {
    return transaction(async (db) => {
      const n = randomUUID();
      const s = (
        await db.query(
          "INSERT INTO subscribers(account_no,name,address) VALUES($1,'Acceptance Test','Synthetic address') RETURNING id",
          [n],
        )
      ).rows[0];
      for (const [index, rate] of rates.entries()) {
        const plan = (
          await db.query(
            "INSERT INTO service_plans(code,name,type,price) VALUES($1,'Test plan','Internet',$2) RETURNING id",
            [n + index, rate],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO service_accounts(account_no,subscriber_id,plan_id,address,rate,activation_date,billing_start) VALUES($1,$2,$3,'Test address',$4,'2026-01-01','2026-01-01')",
          [n + index, s.id, plan.id, rate],
        );
      }
      return s.id as number;
    });
  }
  async function bill(sub: number, period = "2026-08-01") {
    return transaction(async (db) => {
      const services = (
        await db.query(
          "SELECT * FROM service_accounts WHERE subscriber_id=$1",
          [sub],
        )
      ).rows;
      for (const s of services)
        await db.query(
          "INSERT INTO invoices(number,service_id,period,due_date,total) VALUES($1,$2,$3,$3::date+14,$4)",
          ["TEST-" + randomUUID(), s.id, period, s.rate],
        );
    });
  }
  async function pay(sub: number, amount: number) {
    return transaction((db) =>
      postPayment(
        db,
        {
          subscriberId: sub,
          amount,
          method: "Cash",
          idempotencyKey: randomUUID(),
        },
        owner,
      ),
    );
  }
  async function balance(sub: number) {
    return (
      await pool.query(
        "SELECT * FROM invoice_balances WHERE subscriber_id=$1 ORDER BY period,id",
        [sub],
      )
    ).rows;
  }
  beforeAll(async () => {
    app = await buildApp();
    await transaction(async (db) => {
      for (const [role, perms] of Object.entries(rolePermissions)) {
        await db.query("INSERT INTO roles VALUES($1) ON CONFLICT DO NOTHING", [
          role,
        ]);
        for (const p of perms) {
          await db.query(
            "INSERT INTO permissions VALUES($1) ON CONFLICT DO NOTHING",
            [p],
          );
          await db.query(
            "INSERT INTO role_permissions VALUES($1,$2) ON CONFLICT DO NOTHING",
            [role, p],
          );
        }
      }
      for (const [name, role] of [
        ["testowner", "Owner"],
        ["testcash", "Cashier"],
        ["testadmin", "Administrator"],
      ]) {
        const u = (
          await db.query(
            "INSERT INTO users(username,name,password_hash) VALUES($1,$1,$2) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash RETURNING id",
            [name, hashPassword("Test-only-password-2026")],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO user_roles VALUES($1,$2) ON CONFLICT DO NOTHING",
          [u.id, role],
        );
        if (role === "Owner") owner = u.id;
      }
    });
    for (const name of ["testowner", "testcash", "testadmin"]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/login",
        payload: { username: name, password: "Test-only-password-2026" },
      });
      expect(r.statusCode).toBe(200);
      if (name === "testowner") token = r.json().token;
      else if (name === "testadmin") adminToken = r.json().token;
      else cashToken = r.json().token;
    }
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
  });
  it("Administrator has system-only access and cannot grant owner privileges", async () => {
    const h = { authorization: `Bearer ${adminToken}` };
    for (const url of [
      "/system/dashboard",
      "/users",
      "/security-audit",
      "/backups",
      "/system/settings",
    ]) {
      expect(
        (await app.inject({ method: "GET", url: "/api" + url, headers: h }))
          .statusCode,
      ).toBe(200);
    }
    for (const [method, url] of [
      ["GET", "/dashboard"],
      ["GET", "/subscribers"],
      ["GET", "/invoices"],
      ["GET", "/payments"],
      ["GET", "/proofs"],
      ["GET", "/batches"],
      ["GET", "/receivables"],
      ["GET", "/services"],
      ["GET", "/audit"],
      ["GET", "/settings"],
      ["POST", "/subscribers"],
      ["POST", "/payments"],
      ["POST", "/settings"],
      ["POST", "/plans"],
    ] as const) {
      expect(
        (
          await app.inject({
            method,
            url: "/api" + url,
            headers: h,
            ...(method === "POST" ? { payload: {} } : {}),
          })
        ).statusCode,
      ).toBe(403);
    }
    expect(
      (
        await app.inject({ method: "GET", url: "/api/lookups", headers: h })
      ).json(),
    ).toEqual({ plans: [], areas: [], collectors: [] });
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/users",
          headers: h,
          payload: {
            username: "forbidden-owner",
            name: "Forbidden",
            password: "Test-only-password-2026",
            role: "Owner",
          },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/users/${owner}/active`,
          headers: h,
          payload: { active: false },
        })
      ).statusCode,
    ).toBe(400);
    const created = await app.inject({
      method: "POST",
      url: "/api/users",
      headers: h,
      payload: {
        username: randomUUID(),
        name: "Admin managed cashier",
        password: "Test-only-password-2026",
        role: "Cashier",
      },
    });
    expect(created.statusCode).toBe(200);
    const directory = await app.inject({
      method: "GET",
      url: "/api/users",
      headers: h,
    });
    expect(directory.body).not.toContain("password_hash");
    expect(directory.body).not.toContain("token_hash");
    expect(
      directory.json().find((u: any) => u.id === created.json().id),
    ).toMatchObject({ active_sessions: 0, last_sign_in: null });

    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/users/${created.json().id}/active`,
          headers: h,
          payload: { active: false, reason: "Account access review" },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/system/settings",
          headers: h,
          payload: { displayName: "BCIS Test", supportContact: "Test support" },
        })
      ).statusCode,
    ).toBe(200);
    const events = (
      await app.inject({
        method: "GET",
        url: "/api/security-audit",
        headers: h,
      })
    ).json();
    expect(events.rows.some((e: any) => e.action === "auth.login")).toBe(true);
    expect(
      events.rows.every((e: any) =>
        /^(auth|user|backup|system)\./.test(e.action),
      ),
    ).toBe(true);
  });
  it("security audit filters failures, hides secrets and validates dates", async () => {
    const username = "audit-" + randomUUID();
    await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { username, password: "Never-log-this-password" },
    });
    const h = { authorization: `Bearer ${adminToken}` };
    const response = await app.inject({
      method: "GET",
      url: `/api/security-audit?search=${username}&category=auth&outcome=FAILURE`,
      headers: h,
    });
    expect(response.statusCode).toBe(200);
    const result = response.json();
    expect(result.summary.total).toBe(1);
    expect(result.summary.failure).toBe(1);
    expect(result.rows[0].action).toBe("auth.login_failed");
    expect(result.rows[0].source_ip).toBeTruthy();
    expect(result.rows[0].request_id).toBeTruthy();
    expect(response.body).not.toContain("Never-log-this-password");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/security-audit?from=2026-10-10&to=2026-10-01",
          headers: h,
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/security-audit?outcome=DENIED",
          headers: h,
        })
      )
        .json()
        .rows.every((r: any) => r.outcome === "DENIED"),
    ).toBe(true);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/security-audit",
          headers: { authorization: `Bearer ${cashToken}` },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("system dashboard exposes consistent administration metrics without business data", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/system/dashboard",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(response.statusCode).toBe(200);
    const d = response.json();
    expect(d.trend).toHaveLength(7);
    expect(d.active_users).toBeLessThanOrEqual(d.users);
    expect(d.signed_in_users).toBeLessThanOrEqual(d.sessions);
    expect(d.trend.every((r: any) => r.signins >= 0 && r.alerts >= 0)).toBe(
      true,
    );
    expect(d.recent.length).toBeLessThanOrEqual(6);
    expect(
      d.recent.every((r: any) => /^(auth|user|backup|system)\./.test(r.action)),
    ).toBe(true);
    expect(d.roles.some((r: any) => r.role === "Administrator")).toBe(true);
    expect(d).not.toHaveProperty("receivable");
    expect(d).not.toHaveProperty("collected");
    expect(Number.isFinite(Date.parse(d.checkedAt))).toBe(true);
  });
  it("backup verification detects tampering and records checks without restoring", async () => {
    const previous = process.env.STORAGE_DIR;
    const directory = await mkdtemp(path.join(tmpdir(), "bcis-backup-test-"));
    process.env.STORAGE_DIR = directory;
    try {
      const h = { authorization: `Bearer ${adminToken}` };
      const created = await app.inject({
        method: "POST",
        url: "/api/backups",
        headers: h,
        payload: {},
      });
      expect(created.statusCode).toBe(200);
      const rows = (
        await app.inject({ method: "GET", url: "/api/backups", headers: h })
      ).json();
      const record = rows.find((r: any) => r.filename === created.json().name);
      expect(record.created_by).toBeTruthy();
      const verify = () =>
        app.inject({
          method: "POST",
          url: `/api/backups/${record.id}/verify`,
          headers: h,
          payload: {},
        });
      const good = await verify();
      expect(good.statusCode).toBe(200);
      expect(good.json().ok).toBe(true);
      expect(good.json().bytes).toBeGreaterThan(0);
      await appendFile(
        path.join(directory, "backups", record.filename, "database.dump"),
        "tampered",
      );
      expect((await verify()).json().ok).toBe(false);
      const history = (
        await app.inject({ method: "GET", url: "/api/backups", headers: h })
      ).json();
      expect(
        history.find((r: any) => r.id === record.id).verification_outcome,
      ).toBe("FAILURE");
      expect(
        (
          await app.inject({
            method: "POST",
            url: `/api/backups/${record.id}/verify`,
            headers: { authorization: `Bearer ${cashToken}` },
            payload: {},
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      if (previous === undefined) delete process.env.STORAGE_DIR;
      else process.env.STORAGE_DIR = previous;
      await rm(directory, { recursive: true, force: true });
    }
  });
  it("system settings persist workspace identity, validate input and record the editor", async () => {
    const h = { authorization: `Bearer ${adminToken}` };
    const original = (
      await app.inject({
        method: "GET",
        url: "/api/system/settings",
        headers: h,
      })
    ).json();
    try {
      const changed = await app.inject({
        method: "POST",
        url: "/api/system/settings",
        headers: h,
        payload: {
          displayName: "  BCIS Workspace Test  ",
          supportContact: "  Help desk  ",
        },
      });
      expect(changed.statusCode).toBe(200);
      const settings = (
        await app.inject({
          method: "GET",
          url: "/api/system/settings",
          headers: h,
        })
      ).json();
      expect(settings.displayName).toBe("BCIS Workspace Test");
      expect(settings.updated.actor).toBeTruthy();
      const me = (
        await app.inject({
          method: "GET",
          url: "/api/me",
          headers: { authorization: `Bearer ${cashToken}` },
        })
      ).json();
      expect(me.system).toMatchObject({
        displayName: "BCIS Workspace Test",
        supportContact: "Help desk",
      });
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/settings",
            headers: h,
            payload: { displayName: "   ", supportContact: "" },
          })
        ).statusCode,
      ).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/settings",
            headers: { authorization: `Bearer ${cashToken}` },
            payload: { displayName: "Denied", supportContact: "" },
          })
        ).statusCode,
      ).toBe(403);
    } finally {
      await app.inject({
        method: "POST",
        url: "/api/system/settings",
        headers: h,
        payload: {
          displayName: original.displayName,
          supportContact: original.supportContact,
        },
      });
    }
  });
  it("profile pictures are personal and theme changes persist globally", async () => {
    const h = { authorization: `Bearer ${adminToken}` };
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5j0AAAAASUVORK5CYII=";
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/me/profile-picture",
          headers: h,
          payload: { image: png },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/api/me", headers: h })).json()
        .profile_image,
    ).toBe(png);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/me",
          headers: { authorization: `Bearer ${cashToken}` },
        })
      ).json().profile_image,
    ).toBeNull();
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/me/profile-picture",
          headers: h,
          payload: { image: "data:image/svg+xml;base64,PHN2Zz4=" },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/me/profile-picture",
          headers: { authorization: `Bearer ${cashToken}` },
          payload: { image: png },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/me/profile-picture",
          headers: h,
          payload: { image: null },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: "GET", url: "/api/me", headers: h })).json()
        .profile_image,
    ).toBeNull();
    const old = (
      await app.inject({
        method: "GET",
        url: "/api/system/settings",
        headers: h,
      })
    ).json();
    try {
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/settings",
            headers: h,
            payload: {
              displayName: old.displayName,
              supportContact: old.supportContact,
              themeColor: "#7c3aed",
            },
          })
        ).statusCode,
      ).toBe(200);
      expect(
        (await app.inject({ method: "GET", url: "/api/appearance" })).json(),
      ).toMatchObject({ themeColor: "#7c3aed" });
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/settings",
            headers: h,
            payload: {
              displayName: old.displayName,
              supportContact: old.supportContact,
              themeColor: "url(evil)",
            },
          })
        ).statusCode,
      ).toBe(400);
    } finally {
      await app.inject({
        method: "POST",
        url: "/api/system/settings",
        headers: h,
        payload: {
          displayName: old.displayName,
          supportContact: old.supportContact,
          themeColor: old.themeColor || "#2563eb",
        },
      });
    }
  });
  it("system profile stores business details and a shared logo", async () => {
    const h = { authorization: `Bearer ${adminToken}` };
    const png =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5j0AAAAASUVORK5CYII=";
    const settings = (payload: Record<string, string | undefined>) =>
      app.inject({
        method: "POST",
        url: "/api/system/settings",
        headers: h,
        payload,
      });
    const old = (
      await app.inject({
        method: "GET",
        url: "/api/system/settings",
        headers: h,
      })
    ).json();
    const oldLogo = (
      await app.inject({ method: "GET", url: "/api/appearance/logo" })
    ).json().logo;
    const base = {
      displayName: old.displayName,
      supportContact: old.supportContact,
    };
    try {
      const saved = await settings({
        ...base,
        businessName: "  Synthetic Cable Co.  ",
        address: "1 Test Street, Malaybalay City",
        contactNumber: "0917 000 0000",
        email: "billing@example.test",
        tin: "123-456-789-000",
      });
      expect(saved.statusCode).toBe(200);
      expect(saved.json()).toMatchObject({
        businessName: "Synthetic Cable Co.",
        displayName: old.displayName,
      });
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/me",
            headers: { authorization: `Bearer ${cashToken}` },
          })
        ).json().system,
      ).toMatchObject({
        businessName: "Synthetic Cable Co.",
        tin: "123-456-789-000",
        email: "billing@example.test",
      });
      for (const invalid of [
        { tin: "12345" },
        { email: "not-an-email" },
        { businessName: "  " },
      ])
        expect((await settings({ ...base, ...invalid })).statusCode).toBe(400);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/logo",
            headers: { authorization: `Bearer ${cashToken}` },
            payload: { image: png },
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/logo",
            headers: h,
            payload: { image: "data:image/svg+xml;base64,PHN2Zz4=" },
          })
        ).statusCode,
      ).toBe(400);
      const logo = await app.inject({
        method: "POST",
        url: "/api/system/logo",
        headers: h,
        payload: { image: png },
      });
      expect(logo.statusCode).toBe(200);
      const appearance = (
        await app.inject({ method: "GET", url: "/api/appearance" })
      ).json();
      expect(appearance).toMatchObject({
        businessName: "Synthetic Cable Co.",
        logoVersion: logo.json().logoVersion,
      });
      expect(appearance.logo).toBeUndefined();
      expect(
        (
          await app.inject({ method: "GET", url: "/api/appearance/logo" })
        ).json().logo,
      ).toBe(png);
      const pdf = await app.inject({
        method: "GET",
        url: "/api/reports/collections?format=pdf",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(pdf.statusCode).toBe(200);
      expect(pdf.rawPayload.subarray(0, 4).toString()).toBe("%PDF");
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api/settings",
            headers: { authorization: `Bearer ${token}` },
          })
        )
          .json()
          .some((r: { key: string }) => r.key === "system_logo"),
      ).toBe(false);
      expect(
        (
          await app.inject({
            method: "POST",
            url: "/api/system/logo",
            headers: h,
            payload: { image: null },
          })
        ).json(),
      ).toEqual({ logo: null, logoVersion: null });
      expect(
        (await app.inject({ method: "GET", url: "/api/appearance" })).json()
          .logoVersion,
      ).toBeNull();
      const audited = await pool.query(
        "SELECT new_value FROM audit_logs WHERE action='system.logo.update' ORDER BY id DESC LIMIT 1",
      );
      expect(audited.rows[0].new_value).toMatchObject({ hasLogo: false });
    } finally {
      await settings({
        ...base,
        businessName: old.businessName,
        address: old.address,
        contactNumber: old.contactNumber,
        email: old.email,
        tin: old.tin,
      });
      await app.inject({
        method: "POST",
        url: "/api/system/logo",
        headers: h,
        payload: { image: oldLogo },
      });
    }
  });
  it("AT-01 exact payment creates receipt and balanced ledger", async () => {
    const sub = await fixture();
    await bill(sub);
    const p = await pay(sub, 99900);
    expect(p.receipt_no).toMatch(/^RCPT-/);
    expect((await balance(sub))[0].status).toBe("PAID");
    expect((await balance(sub))[0].balance).toBe("0");
    const l = await transaction((db) => ledger(db, sub));
    expect(l.at(-1).balance).toBe(0);
  });
  it("AT-02 partial payment", async () => {
    const sub = await fixture();
    await bill(sub);
    await pay(sub, 50000);
    expect((await balance(sub))[0]).toMatchObject({
      balance: "49900",
      status: "PARTIALLY_PAID",
    });
  });
  it("AT-03 advance credit applied to future invoice", async () => {
    const sub = await fixture([100000]);
    await bill(sub);
    await pay(sub, 300000);
    await transaction((db) => generateBilling(db, "2026-09-01", owner));
    expect((await balance(sub)).every((i) => i.balance === "0")).toBe(true);
    const p = (
      await pool.query(
        "SELECT p.amount-COALESCE(sum(a.amount),0) AS credit FROM payments p LEFT JOIN payment_allocations a ON a.payment_id=p.id WHERE p.subscriber_id=$1 GROUP BY p.id",
        [sub],
      )
    ).rows[0];
    expect(p.credit).toBe("100000");
  });
  it("AT-04 arrears oldest first", async () => {
    const sub = await fixture();
    await bill(sub);
    await bill(sub, "2026-09-01");
    await pay(sub, 120000);
    expect((await balance(sub)).map((i) => i.balance)).toEqual(["0", "79800"]);
  });
  it("AT-05 duplicate reference is blocked at database level", async () => {
    const sub = await fixture();
    const reference = "DUP-" + randomUUID();
    await pool.query(
      "INSERT INTO payment_proofs(subscriber_id,reference,sender,amount) VALUES($1,$2,'Demo',99900)",
      [sub, reference],
    );
    await expect(
      pool.query(
        "INSERT INTO payment_proofs(subscriber_id,reference,sender,amount) VALUES($1,$2,'Demo',99900)",
        [sub, reference],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });
  it("GCash cannot bypass verification", async () => {
    const sub = await fixture();
    const r = await app.inject({
      method: "POST",
      url: "/api/payments",
      headers: headers(),
      payload: {
        subscriberId: sub,
        amount: 99900,
        method: "GCash",
        reference: "NOT-VERIFIED",
        idempotencyKey: randomUUID(),
      },
    });
    expect(r.statusCode).toBe(400);
  });
  it("AT-06 reversal retains receipt and restores ledger", async () => {
    const sub = await fixture();
    await bill(sub);
    const p = await pay(sub, 50000);
    await transaction((db) =>
      reversePayment(db, p.id, "Test reversal correction", owner),
    );
    expect((await balance(sub))[0].balance).toBe("99900");
    expect(
      (await pool.query("SELECT reversed FROM payments WHERE id=$1", [p.id]))
        .rows[0].reversed,
    ).toBe(true);
    const l = await transaction((db) => ledger(db, sub));
    expect(l.at(-1).balance).toBe(99900);
    expect(
      (
        await pool.query(
          "SELECT 1 FROM audit_logs WHERE action='payment.reverse' AND entity_id=$1",
          [String(p.id)],
        )
      ).rowCount,
    ).toBe(1);
  });
  for (const [code, remitted, diff] of [
    ["AT-07", 2000000, 0],
    ["AT-08", 1950000, -50000],
  ] as const)
    it(`${code} remittance difference`, async () => {
      const sub = await fixture();
      const c = (
        await pool.query(
          "INSERT INTO collectors(name) VALUES('Test collector') RETURNING id",
        )
      ).rows[0];
      const b = (
        await pool.query(
          "INSERT INTO collection_batches(collector_id) VALUES($1) RETURNING id",
          [c.id],
        )
      ).rows[0];
      await pool.query("INSERT INTO batch_accounts VALUES($1,$2,2000000)", [
        b.id,
        sub,
      ]);
      await transaction((db) =>
        postPayment(
          db,
          {
            subscriberId: sub,
            amount: 2000000,
            method: "Cash",
            idempotencyKey: randomUUID(),
            batchId: b.id,
          },
          owner,
        ),
      );
      let r = await app.inject({
        method: "POST",
        url: `/api/batches/${b.id}/transition`,
        headers: headers(),
        payload: { status: "SUBMITTED", reason: "Submitted for test" },
      });
      expect(r.statusCode).toBe(200);
      r = await app.inject({
        method: "POST",
        url: `/api/batches/${b.id}/remit`,
        headers: headers(),
        payload: { amount: remitted, reason: "Test counted remittance" },
      });
      expect(r.json().difference).toBe(diff);
      expect(
        (
          await pool.query(
            "SELECT status FROM collection_batches WHERE id=$1",
            [b.id],
          )
        ).rows[0].status,
      ).toBe("REMITTED");
    });
  it("Collection Supervisor has a collection-only workspace with performance results", async () => {
    expect(rolePermissions["Collection Supervisor"]).toEqual([
      "collection.view",
      "collection.manage",
      "collection.reconcile",
      "ledger.view",
    ]);
    const tag = randomUUID().slice(0, 8);
    const supervisor = (
      await pool.query(
        "INSERT INTO users(username,name,password_hash) VALUES($1,$1,$2) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash RETURNING id",
        ["testsupervisor", hashPassword("Test-only-password-2026")],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO user_roles VALUES($1,'Collection Supervisor') ON CONFLICT DO NOTHING",
      [supervisor.id],
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: {
        username: "testsupervisor",
        password: "Test-only-password-2026",
      },
    });
    const h = { authorization: `Bearer ${login.json().token}` };
    const sub = await fixture();
    const area = (
      await pool.query(
        "INSERT INTO collection_areas(name) VALUES($1) RETURNING id",
        ["Route " + tag],
      )
    ).rows[0];
    const c = (
      await pool.query("INSERT INTO collectors(name) VALUES($1) RETURNING id", [
        "Collector " + tag,
      ])
    ).rows[0];
    await pool.query(
      "UPDATE subscribers SET area_id=$1,collector_id=$2 WHERE id=$3",
      [area.id, c.id, sub],
    );
    const b = (
      await pool.query(
        "INSERT INTO collection_batches(collector_id,area_id,expected) VALUES($1,$2,100000) RETURNING id",
        [c.id, area.id],
      )
    ).rows[0];
    await pool.query("INSERT INTO batch_accounts VALUES($1,$2,100000)", [
      b.id,
      sub,
    ]);
    await transaction((db) =>
      postPayment(
        db,
        {
          subscriberId: sub,
          amount: 80000,
          method: "Cash",
          idempotencyKey: randomUUID(),
          batchId: b.id,
        },
        owner,
      ),
    );
    for (const [url, payload] of [
      [
        `/api/batches/${b.id}/transition`,
        { status: "SUBMITTED", reason: "Collector returned from route" },
      ],
      [
        `/api/batches/${b.id}/remit`,
        { amount: 75000, reason: "Counted cash is 50 pesos short" },
      ],
    ] as const)
      expect(
        (await app.inject({ method: "POST", url, headers: h, payload }))
          .statusCode,
      ).toBe(200);
    const get = (url: string) =>
      app.inject({ method: "GET", url: "/api" + url, headers: h });
    const performance = await get("/collections/performance");
    expect(performance.statusCode).toBe(200);
    const row = performance
      .json()
      .rows.find((r: { id: number }) => r.id === c.id);
    expect({
      batches: Number(row.batches),
      assigned: Number(row.assigned),
      expected: Number(row.expected),
      collected: Number(row.collected),
      remitted: Number(row.remitted),
      difference: Number(row.difference),
      shortages: Number(row.shortages),
    }).toEqual({
      batches: 1,
      assigned: 1,
      expected: 100000,
      collected: 80000,
      remitted: 75000,
      difference: -5000,
      shortages: 1,
    });
    expect(
      (await get("/collections/performance?from=2026-02-01&to=2026-01-01"))
        .statusCode,
    ).toBe(400);
    const overview = await get("/collections/overview");
    expect(overview.statusCode).toBe(200);
    expect(Number(overview.json().awaiting_reconciliation)).toBeGreaterThan(0);
    const remittances = (await get("/collections/remittances")).json();
    expect(
      remittances.queue.find((q: { id: number }) => q.id === b.id).status,
    ).toBe("REMITTED");
    expect(
      Number(
        remittances.history.find(
          (r: { batch_id: number }) => r.batch_id === b.id,
        ).difference,
      ),
    ).toBe(-5000);
    const areas = (await get("/collections/areas")).json();
    const listed = areas.areas.find((a: { id: number }) => a.id === area.id);
    expect(Number(listed.active_subscribers)).toBe(1);
    expect(listed.collectors).toBe("Collector " + tag);
    expect((await get("/reports/collectors?format=xlsx")).statusCode).toBe(200);
    for (const url of [
      "/subscribers",
      "/payments",
      "/invoices",
      "/dashboard",
      "/receivables",
      "/reports/subscribers?format=pdf",
      "/reports/aging?format=pdf",
    ])
      expect((await get(url)).statusCode, url).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/collections/overview",
          headers: { authorization: `Bearer ${cashToken}` },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("Auditor reviews and records corrections from the audit workspace", async () => {
    expect(rolePermissions.Auditor).toEqual(
      expect.arrayContaining(["audit.view", "payment.reverse", "report.view"]),
    );
    const auditor = (
      await pool.query(
        "INSERT INTO users(username,name,password_hash) VALUES($1,$1,$2) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash RETURNING id",
        ["testauditor", hashPassword("Test-only-password-2026")],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO user_roles VALUES($1,'Auditor') ON CONFLICT DO NOTHING",
      [auditor.id],
    );
    const login = await app.inject({
      method: "POST",
      url: "/api/login",
      payload: { username: "testauditor", password: "Test-only-password-2026" },
    });
    const h = { authorization: `Bearer ${login.json().token}` };
    const call = (method: "GET" | "POST", url: string, payload?: object) =>
      app.inject({ method, url: "/api" + url, headers: h, payload });
    const paid = await fixture();
    await bill(paid);
    const payment = await pay(paid, 99900);
    const billed = await fixture([50000, 30000]);
    await bill(billed);
    const [adjustInvoice, voidInvoice] = await balance(billed);
    const lookup = await call(
      "GET",
      `/corrections/lookup?search=${payment.receipt_no}`,
    );
    expect(lookup.statusCode).toBe(200);
    expect(lookup.json().payments[0].id).toBe(payment.id);
    for (const [url, payload] of [
      [
        `/payments/${payment.id}/reverse`,
        { reason: "Duplicate receipt found in review" },
      ],
      [
        `/invoices/${adjustInvoice.id}/adjust`,
        { amount: -10000, reason: "Approved outage credit" },
      ],
      [
        `/invoices/${voidInvoice.id}/void`,
        { reason: "Billed for a service never installed" },
      ],
    ] as const)
      expect((await call("POST", url, payload)).statusCode, url).toBe(200);
    const register = (await call("GET", "/corrections")).json();
    const mine = register.rows.filter(
      (r: { subscriber_id: number }) =>
        r.subscriber_id === paid || r.subscriber_id === billed,
    );
    expect(
      mine
        .map((r: { kind: string; amount: string; actor: string }) => [
          r.kind,
          Number(r.amount),
          r.actor,
        ])
        .sort(),
    ).toEqual(
      [
        ["ADJUSTMENT", -10000, "testauditor"],
        ["REVERSAL", 99900, "testauditor"],
        ["VOID", -30000, "testauditor"],
      ].sort(),
    );
    expect(mine.find((r: { kind: string }) => r.kind === "VOID").reason).toBe(
      "Billed for a service never installed",
    );
    const voids = (await call("GET", "/corrections?kind=VOID")).json();
    expect(voids.rows.every((r: { kind: string }) => r.kind === "VOID")).toBe(
      true,
    );
    const searched = (
      await call("GET", `/corrections?search=${payment.receipt_no}`)
    ).json();
    expect(searched.rows.map((r: { kind: string }) => r.kind)).toEqual([
      "REVERSAL",
    ]);
    expect(
      (await call("GET", "/corrections?from=2026-02-01&to=2026-01-01"))
        .statusCode,
    ).toBe(400);
    const overview = await call("GET", "/audit/overview");
    expect(overview.statusCode).toBe(200);
    expect(Number(overview.json().summary.reversals)).toBeGreaterThan(0);
    expect(Number(overview.json().receivables.total)).toBeGreaterThan(0);
    for (const url of ["/receivables", "/audit", "/reports/aging?format=pdf"])
      expect((await call("GET", url)).statusCode, url).toBe(200);
    for (const url of [
      "/corrections",
      "/audit/overview",
      "/corrections/lookup?search=RCPT",
    ])
      expect(
        (
          await app.inject({
            method: "GET",
            url: "/api" + url,
            headers: { authorization: `Bearer ${cashToken}` },
          })
        ).statusCode,
        url,
      ).toBe(403);
  });
  it("Ledger page is available to Owner and Collection Supervisor only", async () => {
    expect(rolePermissions["Collection Supervisor"]).toContain("ledger.view");
    const sub = await fixture();
    await bill(sub);
    const p = await pay(sub, 50000);
    const user = (
      await pool.query(
        "INSERT INTO users(username,name,password_hash) VALUES($1,$1,$2) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash RETURNING id",
        ["testsupervisor", hashPassword("Test-only-password-2026")],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO user_roles VALUES($1,'Collection Supervisor') ON CONFLICT DO NOTHING",
      [user.id],
    );
    const supervisor = (
      await app.inject({
        method: "POST",
        url: "/api/login",
        payload: {
          username: "testsupervisor",
          password: "Test-only-password-2026",
        },
      })
    ).json().token;
    const account = (
      await pool.query("SELECT account_no FROM subscribers WHERE id=$1", [sub])
    ).rows[0].account_no;
    for (const t of [token, supervisor]) {
      const h = { authorization: `Bearer ${t}` };
      const list = await app.inject({
        method: "GET",
        url: `/api/ledger/subscribers?search=${account}`,
        headers: h,
      });
      expect(list.statusCode).toBe(200);
      expect(list.json().map((r: { id: number }) => r.id)).toEqual([sub]);
      expect(Number(list.json()[0].outstanding)).toBe(49900);
      const l = (
        await app.inject({
          method: "GET",
          url: `/api/ledger/${sub}`,
          headers: h,
        })
      ).json();
      expect(l.subscriber.account_no).toBe(account);
      expect(l.rows.map((r: { reference: string }) => r.reference)).toContain(
        p.receipt_no,
      );
      expect([l.debits, l.credits, l.balance]).toEqual([99900, 50000, 49900]);
      const soa = await app.inject({
        method: "GET",
        url: `/api/reports/soa?format=pdf&subscriberId=${sub}`,
        headers: h,
      });
      expect(soa.statusCode).toBe(200);
    }
    for (const t of [cashToken, adminToken])
      for (const url of [`/api/ledger/subscribers`, `/api/ledger/${sub}`])
        expect(
          (
            await app.inject({
              method: "GET",
              url,
              headers: { authorization: `Bearer ${t}` },
            })
          ).statusCode,
          url,
        ).toBe(403);
  });
  it("Technician workspace shows operational service data without amounts", async () => {
    const tech = (
      await pool.query(
        "INSERT INTO users(username,name,password_hash) VALUES($1,$1,$2) ON CONFLICT(username) DO UPDATE SET password_hash=excluded.password_hash RETURNING id",
        ["testtechnician", hashPassword("Test-only-password-2026")],
      )
    ).rows[0];
    await pool.query(
      "INSERT INTO user_roles VALUES($1,'Technician') ON CONFLICT DO NOTHING",
      [tech.id],
    );
    const h = {
      authorization: `Bearer ${
        (
          await app.inject({
            method: "POST",
            url: "/api/login",
            payload: {
              username: "testtechnician",
              password: "Test-only-password-2026",
            },
          })
        ).json().token
      }`,
    };
    const get = (url: string) =>
      app.inject({ method: "GET", url: "/api" + url, headers: h });
    const money = /"(rate|price|fee|outstanding|balance|amount|total)"/;
    // Suspended service with overdue debt (blocked) and one with none (ready).
    const blocked = await fixture();
    await bill(blocked, "2026-01-01");
    const ready = await fixture();
    const services = (
      await pool.query(
        "SELECT id,subscriber_id FROM service_accounts WHERE subscriber_id=ANY($1)",
        [[blocked, ready]],
      )
    ).rows;
    const svc = (sub: number) =>
      services.find((r: { subscriber_id: number }) => r.subscriber_id === sub)
        .id;
    for (const sub of [blocked, ready]) {
      await pool.query(
        "UPDATE service_accounts SET status='SUSPENDED' WHERE id=$1",
        [svc(sub)],
      );
      await pool.query(
        "INSERT INTO suspension_records(service_id,reason,approved_by,effective_date) VALUES($1,'Overdue test',$2,CURRENT_DATE)",
        [svc(sub), owner],
      );
    }
    const requests = (
      await pool.query(
        "INSERT INTO reconnection_records(service_id,technician_id) VALUES($1,$3),($2,$3) RETURNING id,service_id",
        [svc(blocked), svc(ready), tech.id],
      )
    ).rows;
    const reqFor = (sub: number) =>
      requests.find((r: { service_id: number }) => r.service_id === svc(sub))
        .id;
    for (const url of [
      "/field/overview",
      "/field/services",
      "/field/suspensions",
      "/field/reconnections",
      "/field/reconnections?view=completed",
      "/services",
      "/suspension-candidates",
      "/lookups",
    ]) {
      const r = await get(url);
      expect(r.statusCode, url).toBe(200);
      expect(r.body, url).not.toMatch(money);
    }
    const pending = (await get("/field/reconnections")).json();
    const row = (sub: number) =>
      pending.find((r: { id: number }) => r.id === reqFor(sub));
    expect([row(blocked).ready, row(ready).ready]).toEqual([false, true]);
    expect(
      (await get("/field/suspensions"))
        .json()
        .suspended.some((r: { id: number }) => r.id === svc(ready)),
    ).toBe(true);
    const complete = (sub: number) =>
      app.inject({
        method: "POST",
        url: `/api/reconnections/${reqFor(sub)}/complete`,
        headers: h,
        payload: {},
      });
    expect((await complete(blocked)).statusCode).toBe(400);
    expect((await complete(ready)).statusCode).toBe(200);
    expect(
      (
        await pool.query("SELECT status FROM service_accounts WHERE id=$1", [
          svc(ready),
        ])
      ).rows[0].status,
    ).toBe("ACTIVE");
    expect(
      (await get("/field/reconnections?view=completed"))
        .json()
        .some((r: { id: number }) => r.id === reqFor(ready)),
    ).toBe(true);
    for (const url of [
      "/subscribers",
      "/payments",
      "/invoices",
      "/receivables",
      "/dashboard",
      "/ledger/subscribers",
    ])
      expect((await get(url)).statusCode, url).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/services/${svc(blocked)}/state`,
          headers: h,
          payload: { status: "TERMINATED", reason: "Not allowed for tech" },
        })
      ).statusCode,
    ).toBe(403);
  });
  it("AT-09 concurrent same-account posting preserves value and unique receipts", async () => {
    const sub = await fixture();
    await bill(sub);
    const result = await Promise.all([
      pay(sub, 40000),
      pay(sub, 40000),
      pay(sub, 40000),
    ]);
    expect(new Set(result.map((p) => p.receipt_no)).size).toBe(3);
    expect((await balance(sub))[0].balance).toBe("0");
    const allocated = Number(
      (
        await pool.query(
          "SELECT sum(a.amount) AS total FROM payment_allocations a JOIN payments p ON p.id=a.payment_id WHERE p.subscriber_id=$1",
          [sub],
        )
      ).rows[0].total,
    );
    expect(allocated).toBe(99900);
  });
  it("AT-10 direct cashier administration request is forbidden", async () => {
    for (const endpoint of ["/users", "/backups"]) {
      const r = await app.inject({
        method: "GET",
        url: "/api" + endpoint,
        headers: { authorization: `Bearer ${cashToken}` },
      });
      expect(r.statusCode).toBe(403);
    }
  });
  it("AT-11 billing generation is idempotent", async () => {
    await fixture();
    const a = await transaction((db) =>
      generateBilling(db, "2026-10-01", owner),
    );
    const b = await transaction((db) =>
      generateBilling(db, "2026-10-01", owner),
    );
    expect(a.count).toBeGreaterThan(0);
    expect(b.count).toBe(0);
  });
  it("retries do not create duplicate payment", async () => {
    const sub = await fixture();
    const input = {
      subscriberId: sub,
      amount: 100,
      method: "Cash",
      idempotencyKey: randomUUID(),
    };
    const first = await transaction((db) => postPayment(db, input, owner));
    const second = await transaction((db) => postPayment(db, input, owner));
    expect(first.id).toBe(second.id);
  });
  it("rollback removes every step of failed posting", async () => {
    const sub = await fixture();
    await expect(
      transaction(async (db) => {
        await postPayment(
          db,
          {
            subscriberId: sub,
            amount: 100,
            method: "Cash",
            idempotencyKey: randomUUID(),
          },
          owner,
        );
        throw new Error("Injected failure");
      }),
    ).rejects.toThrow("Injected failure");
    expect(
      (await pool.query("SELECT 1 FROM payments WHERE subscriber_id=$1", [sub]))
        .rowCount,
    ).toBe(0);
  });
  it("calendar DATE stays unchanged and database uses Manila timezone", async () => {
    const r = (
      await pool.query(
        "SELECT DATE '2026-10-09' AS day,current_setting('TimeZone') AS zone",
      )
    ).rows[0];
    expect(r.day).toBe("2026-10-09");
    expect(r.zone).toBe("Asia/Manila");
  });
  it("invoice void preserves original and offsets ledger", async () => {
    const sub = await fixture();
    await bill(sub);
    const invoice = (await balance(sub))[0];
    const r = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/void`,
      headers: headers(),
      payload: { reason: "Acceptance: invoice raised in error" },
    });
    expect(r.statusCode).toBe(200);
    expect((await balance(sub))[0]).toMatchObject({
      status: "VOID",
      total: "99900",
      balance: "0",
    });
    expect((await transaction((db) => ledger(db, sub))).at(-1).balance).toBe(0);
  });
  it("credit adjustment cannot consume allocated payment value", async () => {
    const sub = await fixture();
    await bill(sub);
    await pay(sub, 50000);
    const invoice = (await balance(sub))[0];
    const r = await app.inject({
      method: "POST",
      url: `/api/invoices/${invoice.id}/adjust`,
      headers: headers(),
      payload: { amount: -50000, reason: "Acceptance: invalid excess credit" },
    });
    expect(r.statusCode).toBe(400);
    expect((await balance(sub))[0].balance).toBe("49900");
  });
  it("future rate change preserves finalized invoices", async () => {
    const sub = await fixture();
    await bill(sub);
    const old = (await balance(sub))[0];
    const r = await app.inject({
      method: "POST",
      url: `/api/services/${old.service_id}/rate`,
      headers: headers(),
      payload: {
        rate: 149900,
        reason: "Acceptance: new agreed subscription rate",
      },
    });
    expect(r.statusCode).toBe(200);
    expect((await balance(sub))[0].total).toBe("99900");
    await transaction((db) => generateBilling(db, "2027-01-01", owner));
    expect(
      (await balance(sub)).find((i) => i.period === "2027-01-01").total,
    ).toBe("149900");
  });
  it("generates locked subscriber IDs and ignores client overrides", async () => {
    const area = (
      await pool.query(
        "INSERT INTO collection_areas(name) VALUES($1) RETURNING id",
        ["Numbering " + randomUUID()],
      )
    ).rows[0].id;
    const collector = (
      await pool.query(
        "INSERT INTO collectors(name) VALUES('Numbering test collector') RETURNING id",
      )
    ).rows[0].id;
    const payload = {
      name: "Automatic registration test",
      contact: "DEMO",
      address: "Synthetic address",
      areaId: area,
      collectorId: collector,
      billingDay: 1,
      dueDay: 15,
    };
    const responses = await Promise.all(
      Array.from({ length: 3 }, () =>
        app.inject({
          method: "POST",
          url: "/api/subscribers",
          headers: headers(),
          payload,
        }),
      ),
    );
    for (const response of responses) {
      expect(response.statusCode).toBe(200);
      expect(response.json().account_no).toMatch(/^BCIS-\d{5,}$/);
      const record = response.json();
      expect(
        (
          await pool.query(
            "SELECT new_value->>'account_no' AS account FROM audit_logs WHERE action='subscriber.create' AND entity_id=$1",
            [String(record.id)],
          )
        ).rows[0].account,
      ).toBe(record.account_no);
    }
    expect(new Set(responses.map((r) => r.json().account_no)).size).toBe(3);
    const suggestions = await Promise.all(
      Array.from({ length: 2 }, () =>
        app.inject({
          method: "POST",
          url: "/api/subscribers/account-number",
          headers: headers(),
          payload: {},
        }),
      ),
    );
    expect(suggestions.every((r) => r.statusCode === 200)).toBe(true);
    expect(suggestions[0].json().account_no).not.toBe(
      suggestions[1].json().account_no,
    );
    const suggestion = suggestions[0].json();
    const create = () =>
      app.inject({
        method: "POST",
        url: "/api/subscribers",
        headers: headers(),
        payload: {
          ...payload,
          accountNo: "TAMPERED",
          identifierToken: suggestion.token,
        },
      });
    const saved = await create();
    expect(saved.statusCode).toBe(200);
    expect(saved.json().account_no).toBe(suggestion.account_no);
    expect((await create()).statusCode).toBe(400);
    const edited = await app.inject({
      method: "POST",
      url: `/api/subscribers/${saved.json().id}/edit`,
      headers: headers(),
      payload: { ...payload, accountNo: "TAMPERED" },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().account_no).toBe(suggestion.account_no);
    const planSuggestion = (
      await app.inject({
        method: "POST",
        url: "/api/plans/account-number",
        headers: headers(),
        payload: {},
      })
    ).json();
    const plan = await app.inject({
      method: "POST",
      url: "/api/plans",
      headers: headers(),
      payload: {
        identifierToken: planSuggestion.token,
        code: "TAMPERED",
        name: "Generated test",
        type: "Internet",
        price: 99900,
      },
    });
    expect(plan.statusCode).toBe(200);
    expect(plan.json().code).toBe(planSuggestion.account_no);
    const planEdit = await app.inject({
      method: "POST",
      url: `/api/plans/${plan.json().id}/edit`,
      headers: headers(),
      payload: {
        code: "TAMPERED",
        name: "Updated plan",
        type: "Internet",
        price: 99900,
        fee: 0,
        speed: null,
        channels: null,
        description: "",
        active: true,
      },
    });
    expect(planEdit.statusCode).toBe(200);
    expect(planEdit.json().code).toBe(planSuggestion.account_no);
    const serviceSuggestion = (
      await app.inject({
        method: "POST",
        url: "/api/services/account-number",
        headers: headers(),
        payload: {},
      })
    ).json();
    const servicePayload = {
      identifierToken: serviceSuggestion.token,
      accountNo: "TAMPERED",
      subscriberId: saved.json().id,
      planId: plan.json().id,
      address: "Test",
      rate: 99900,
      activationDate: "2026-10-01",
      billingStart: "2026-10-01",
      dueDay: 15,
    };
    const wrongKind = await app.inject({
      method: "POST",
      url: "/api/services",
      headers: headers(),
      payload: {
        ...servicePayload,
        identifierToken: suggestions[1].json().token,
      },
    });
    expect(wrongKind.statusCode).toBe(400);
    const service = await app.inject({
      method: "POST",
      url: "/api/services",
      headers: headers(),
      payload: servicePayload,
    });
    expect(service.statusCode).toBe(200);
    expect(service.json().account_no).toBe(serviceSuggestion.account_no);
  });
  it("generated numbers skip existing seeded accounts and do not truncate long numbers", async () => {
    const current = BigInt(
      (await pool.query("SELECT last_value FROM subscriber_account_number"))
        .rows[0].last_value,
    );
    const reserved = current + 100000n;
    await pool.query(
      "SELECT setval('subscriber_account_number',$1::bigint,true)",
      [(reserved - 1n).toString()],
    );
    const number = "BCIS-" + reserved.toString();
    await pool.query(
      "INSERT INTO subscribers(account_no,name,address) VALUES($1,'Reserved seed account','Synthetic address')",
      [number],
    );
    const created = (
      await pool.query(
        "INSERT INTO subscribers(name,address) VALUES('Automatic after seed','Synthetic address') RETURNING account_no",
      )
    ).rows[0];
    expect(created.account_no).toBe("BCIS-" + (reserved + 1n).toString());
    expect(
      (
        await pool.query("SELECT name FROM subscribers WHERE account_no=$1", [
          number,
        ])
      ).rows[0].name,
    ).toBe("Reserved seed account");
  });
});

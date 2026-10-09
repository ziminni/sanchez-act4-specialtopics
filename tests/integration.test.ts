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
    cashToken: string;
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
    for (const name of ["testowner", "testcash"]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/login",
        payload: { username: name, password: "Test-only-password-2026" },
      });
      expect(r.statusCode).toBe(200);
      if (name === "testowner") token = r.json().token;
      else cashToken = r.json().token;
    }
  });
  afterAll(async () => {
    await app?.close();
    await pool.end();
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

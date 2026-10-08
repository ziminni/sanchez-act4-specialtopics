import { randomUUID } from "node:crypto";
import { pool, transaction, audit } from "../../source/server/db.js";
import { hashPassword } from "../../source/server/auth.js";
import { rolePermissions } from "../../source/shared/domain.js";
import {
  generateBilling,
  postPayment,
  reversePayment,
} from "../../source/server/finance.js";
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12)
  throw new Error(
    "Set SEED_PASSWORD to a unique password of at least 12 characters",
  );
await transaction(async (db) => {
  if (Number((await db.query("SELECT count(*) FROM users")).rows[0].count))
    throw new Error(
      "Seed requires an empty database; existing data is never overwritten",
    );
  for (const [role, perms] of Object.entries(rolePermissions)) {
    await db.query("INSERT INTO roles VALUES($1)", [role]);
    for (const permission of perms) {
      await db.query(
        "INSERT INTO permissions VALUES($1) ON CONFLICT DO NOTHING",
        [permission],
      );
      await db.query("INSERT INTO role_permissions VALUES($1,$2)", [
        role,
        permission,
      ]);
    }
  }
  const accounts = [
    ["owner", "Demo Owner", "Owner"],
    ["admin", "Demo Administrator", "Administrator"],
    ["cashier", "Demo Cashier", "Cashier"],
    ["supervisor", "Demo Collection Supervisor", "Collection Supervisor"],
    ["auditor", "Demo Auditor", "Auditor"],
    ["technician", "Demo Technician", "Technician"],
    ["viewer", "Demo Viewer", "Viewer"],
  ];
  for (const [username, name, role] of accounts) {
    const u = (
      await db.query(
        "INSERT INTO users(username,name,password_hash) VALUES($1,$2,$3) RETURNING id",
        [username, name, hashPassword(password)],
      )
    ).rows[0];
    await db.query("INSERT INTO user_roles VALUES($1,$2)", [u.id, role]);
  }
  for (const area of ["Poblacion Central", "Casisang North", "Sumpong East"])
    await db.query("INSERT INTO collection_areas(name) VALUES($1)", [area]);
  for (const name of ["Marco Demo", "Elena Sample"])
    await db.query("INSERT INTO collectors(name) VALUES($1)", [name]);
  const plans = [
    ["NET-999", "Fiber Essential 50", "Internet", 99900, 50, null],
    ["NET-1499", "Fiber Plus 100", "Internet", 149900, 100, null],
    ["NET-1999", "Fiber Pro 200", "Internet", 199900, 200, null],
    ["TV-399", "Cable Basic", "Cable", 39900, null, 65],
    ["TV-599", "Cable Premium", "Cable", 59900, null, 100],
    ["COMBO-1299", "Fiber + Cable Essential", "Combo", 129900, 50, 65],
    ["COMBO-1799", "Fiber + Cable Plus", "Combo", 179900, 100, 100],
  ];
  for (const p of plans)
    await db.query(
      "INSERT INTO service_plans(code,name,type,price,speed,channels) VALUES($1,$2,$3,$4,$5,$6)",
      p,
    );
  const first = [
    "Amara",
    "Ben",
    "Carla",
    "Diego",
    "Elise",
    "Felix",
    "Grace",
    "Hugo",
    "Isabel",
    "Jonas",
  ];
  const last = [
    "Demo Cruz",
    "Sample Reyes",
    "Demo Santos",
    "Sample Flores",
    "Demo Garcia",
  ];
  const current = new Date();
  const periods = [3, 2, 1, 0].map((n) =>
    new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() - n, 1))
      .toISOString()
      .slice(0, 10),
  );
  for (let n = 1; n <= 50; n++) {
    const sub = (
      await db.query(
        "INSERT INTO subscribers(account_no,name,contact,address,area_id,collector_id,notes) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
        [
          `BCIS-${String(n).padStart(5, "0")}`,
          `${first[(n - 1) % 10]} ${last[Math.floor((n - 1) / 10)]}`,
          "DEMO-" + String(n).padStart(4, "0"),
          `${n} Sample Street, Malaybalay`,
          ((n - 1) % 3) + 1,
          ((n - 1) % 2) + 1,
          "Synthetic laboratory record — not a real customer",
        ],
      )
    ).rows[0];
    for (let j = 0; j < (n <= 10 ? 2 : 1); j++) {
      const plan = (n + j - 1) % 7;
      await db.query(
        "INSERT INTO service_accounts(account_no,subscriber_id,plan_id,address,rate,activation_date,billing_start,collector_id) VALUES($1,$2,$3,$4,$5,$6,$6,$7)",
        [
          `SVC-${String(n).padStart(5, "0")}-${j + 1}`,
          sub.id,
          plan + 1,
          `${n} Sample Street, Malaybalay`,
          plans[plan][3],
          periods[0],
          ((n - 1) % 2) + 1,
        ],
      );
    }
  }
  for (const period of periods) await generateBilling(db, period, 1);
  for (let n = 1; n <= 35; n++) {
    const total = Number(
      (
        await db.query(
          "SELECT sum(balance) AS total FROM invoice_balances WHERE subscriber_id=$1",
          [n],
        )
      ).rows[0].total,
    );
    await postPayment(
      db,
      {
        subscriberId: n,
        amount:
          n <= 10 ? total : n <= 25 ? Math.floor(total / 2) : total + 200000,
        method: n % 3 === 0 ? "Bank Transfer" : "Cash",
        idempotencyKey: randomUUID(),
        notes: "Synthetic demo payment",
      },
      1,
    );
  }
  const reversed = await postPayment(
    db,
    {
      subscriberId: 40,
      amount: 50000,
      method: "Cash",
      idempotencyKey: randomUUID(),
      notes: "Reversal demonstration",
    },
    1,
  );
  await reversePayment(
    db,
    reversed.id,
    "Demo: duplicate cash entry corrected",
    1,
  );
  for (const n of [42, 43]) {
    const s = (
      await db.query(
        "SELECT id FROM service_accounts WHERE subscriber_id=$1 LIMIT 1",
        [n],
      )
    ).rows[0];
    await db.query(
      "UPDATE service_accounts SET status='SUSPENDED' WHERE id=$1",
      [s.id],
    );
    await db.query(
      "INSERT INTO suspension_records(service_id,reason,approved_by,effective_date) VALUES($1,'Demo overdue account',1,CURRENT_DATE)",
      [s.id],
    );
    await db.query(
      "INSERT INTO service_events(service_id,kind,reason,actor_id) VALUES($1,'SUSPENDED','Demo overdue account',1)",
      [s.id],
    );
  }
  const gcash = (
    await db.query(
      "INSERT INTO payment_proofs(subscriber_id,reference,sender,amount,status,reviewed_by,reviewed_at,reason) VALUES(39,'DEMO-GCASH-VERIFIED','Synthetic sender',99900,'VERIFIED',1,now(),'Synthetic seed verification') RETURNING id",
    )
  ).rows[0];
  await postPayment(
    db,
    {
      subscriberId: 39,
      amount: 99900,
      method: "GCash",
      reference: "DEMO-GCASH-VERIFIED",
      proofId: gcash.id,
      idempotencyKey: randomUUID(),
    },
    1,
  );
  const reconnect = (
    await db.query(
      "SELECT id FROM service_accounts WHERE subscriber_id=42 LIMIT 1",
    )
  ).rows[0];
  const arrears = Number(
    (
      await db.query(
        "SELECT sum(balance) AS total FROM invoice_balances WHERE subscriber_id=42",
      )
    ).rows[0].total,
  );
  await postPayment(
    db,
    {
      subscriberId: 42,
      amount: arrears,
      method: "Cash",
      idempotencyKey: randomUUID(),
      notes: "Synthetic reconnection qualification",
    },
    1,
  );
  await db.query(
    "INSERT INTO reconnection_records(service_id,technician_id,completed_at) VALUES($1,6,now())",
    [reconnect.id],
  );
  await db.query("UPDATE service_accounts SET status='ACTIVE' WHERE id=$1", [
    reconnect.id,
  ]);
  await db.query(
    "INSERT INTO service_events(service_id,kind,reason,actor_id) VALUES($1,'RECONNECTED','Synthetic completed reconnection',6)",
    [reconnect.id],
  );
  for (let n = 36; n <= 38; n++)
    await db.query(
      "INSERT INTO payment_proofs(subscriber_id,reference,sender,amount) VALUES($1,$2,$3,99900)",
      [n, `DEMO-GCASH-2026-${n}`, "Synthetic sender"],
    );
  await db.query(
    `INSERT INTO collection_batches(collector_id,area_id,expected) VALUES(1,1,0),(2,2,0)`,
  );
  await db.query(
    `INSERT INTO batch_accounts SELECT b.id,s.id,COALESCE(sum(i.balance),0) FROM collection_batches b JOIN subscribers s ON s.collector_id=b.collector_id AND s.area_id=b.area_id LEFT JOIN invoice_balances i ON i.subscriber_id=s.id GROUP BY b.id,s.id`,
  );
  await db.query(
    "UPDATE collection_batches b SET expected=(SELECT sum(expected) FROM batch_accounts WHERE batch_id=b.id)",
  );
  await db.query(
    `INSERT INTO application_settings VALUES('service_policy','{"graceDays":7,"suspensionDays":60}')`,
  );
  await audit(db, 1, "demo.seed", "system", "seed", {
    subscribers: 50,
    services: 60,
    months: 4,
  });
});
await pool.end();
console.log(
  "Synthetic demo seeded: 7 users, 7 plans, 50 subscribers, 60 services, 4 months. Sign in as owner using SEED_PASSWORD.",
);

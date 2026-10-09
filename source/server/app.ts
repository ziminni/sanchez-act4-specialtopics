import { reserveIdentifier, consumeIdentifier } from "./identifiers.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { pool, transaction, audit } from "./db.js";
import { hashPassword, verifyPassword, tokenHash } from "./auth.js";
import {
  generateBilling,
  postPayment,
  reversePayment,
  ledger,
  lockSubscriber,
  applyCredit,
} from "./finance.js";
import { rolePermissions, aging } from "../shared/domain.js";
import { exportReport } from "./reports.js";
import { createBackup } from "./backup.js";
declare module "fastify" {
  interface FastifyRequest {
    actor: { id: number; name: string; permissions: string[]; roles: string[] };
  }
}
const id = z.coerce.number().int().positive();
const amount = z.number().int().positive().max(999999999999);
const reason = z.string().trim().min(5).max(1000);
const text = z.string().trim().min(1).max(200);
const paymentSchema = z.object({
  subscriberId: id,
  amount,
  method: z.enum(["Cash", "GCash", "Bank Transfer", "Cheque", "Other"]),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.uuid(),
  batchId: id.optional(),
});
export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "password_hash",
      ],
    },
    bodyLimit: 1024 * 1024,
  });
  await app.register(cors, {
    origin: (process.env.UI_ORIGIN || "http://127.0.0.1:5173").split(","),
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { code?: string; statusCode?: number };
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (e.code === "23505")
      return reply.code(409).send({
        error:
          "This account, billing period, receipt, or reference already exists.",
      });
    if (e.code === "23503")
      return reply
        .code(400)
        .send({ error: "A referenced record does not exist." });
    if (e.code && /^\d{5}$/.test(e.code)) {
      req.log.error({ err: e }, "Database operation rejected");
      return reply.code(400).send({
        error:
          "The operation violates a data integrity rule. Check the record and try again.",
      });
    }
    if (e.statusCode)
      return reply.code(e.statusCode).send({ error: e.message });
    req.log.error({ err: e }, "Request failed");
    return reply.code(400).send({
      error: e.message.includes("connect")
        ? "Database unavailable. Check the server connection."
        : e.message,
    });
  });
  const requirePermission =
    (permission: string) => async (req: any, reply: any) => {
      const token = String(req.headers.authorization || "").replace(
        /^Bearer /,
        "",
      );
      const user = (
        await pool.query(
          `SELECT u.id,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
          [tokenHash(token)],
        )
      ).rows[0];
      if (!user)
        return reply
          .code(401)
          .send({ error: "Your session has expired. Please sign in." });
      const roles = (
        await pool.query("SELECT role_id FROM user_roles WHERE user_id=$1", [
          user.id,
        ])
      ).rows.map((r) => r.role_id);
      const permissions = (
        await pool.query(
          "SELECT DISTINCT permission_id FROM role_permissions WHERE role_id=ANY($1::text[])",
          [roles],
        )
      ).rows.map((r) => r.permission_id);
      req.actor = { ...user, roles, permissions };
      if (
        permission &&
        !permissions.includes("*") &&
        !permissions.includes(permission)
      )
        return reply
          .code(403)
          .send({ error: "Your role does not permit this action." });
    };
  const get = (url: string, permission: string, handler: any) =>
    app.get(
      "/api" + url,
      { preHandler: requirePermission(permission) },
      handler,
    );
  const post = (url: string, permission: string, handler: any) =>
    app.post(
      "/api" + url,
      { preHandler: requirePermission(permission) },
      handler,
    );
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", database: "connected" };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = z
        .object({ username: text, password: z.string().min(1).max(200) })
        .parse(req.body);
      const u = (
        await pool.query("SELECT * FROM users WHERE username=$1 AND active", [
          b.username,
        ])
      ).rows[0];
      if (!u || !verifyPassword(b.password, u.password_hash))
        return reply.code(401).send({ error: "Invalid username or password." });
      const token = randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [tokenHash(token), u.id],
      );
      return { token };
    },
  );
  get("/me", "", async (req: any) => req.actor);
  post("/logout", "", async (req: any) => {
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(req.headers.authorization.replace(/^Bearer /, "")),
    ]);
    return { ok: true };
  });
  get("/lookups", "", async (req: any) => {
    const operational = req.actor.permissions.some((p: string) =>
      ["*", "subscriber.view", "service.view", "collection.view"].includes(p),
    );
    return {
      plans: (await pool.query("SELECT * FROM service_plans ORDER BY id")).rows,
      areas: (await pool.query("SELECT * FROM collection_areas ORDER BY name"))
        .rows,
      collectors: operational
        ? (await pool.query("SELECT * FROM collectors ORDER BY name")).rows
        : [],
    };
  });
  get("/subscribers", "subscriber.view", async (req: any) => {
    const q = z
      .object({
        search: z.string().max(100).default(""),
        page: z.coerce.number().int().min(1).default(1),
        area: z.coerce.number().int().optional(),
      })
      .parse(req.query);
    const values = [`%${q.search}%`, q.area || null];
    const where = `WHERE (s.name ILIKE $1 OR s.account_no ILIKE $1 OR s.contact ILIKE $1 OR s.address ILIKE $1 OR EXISTS(SELECT 1 FROM payments p WHERE p.subscriber_id=s.id AND (p.receipt_no ILIKE $1 OR p.reference ILIKE $1)) OR EXISTS(SELECT 1 FROM invoice_balances i WHERE i.subscriber_id=s.id AND i.number ILIKE $1)) AND ($2::int IS NULL OR s.area_id=$2)`;
    return {
      rows: (
        await pool.query(
          `SELECT s.*,a.name AS area,c.name AS collector,COALESCE((SELECT sum(balance) FROM invoice_balances WHERE subscriber_id=s.id AND status NOT IN ('VOID','DRAFT')),0) AS outstanding FROM subscribers s LEFT JOIN collection_areas a ON a.id=s.area_id LEFT JOIN collectors c ON c.id=s.collector_id ${where} ORDER BY s.name LIMIT 25 OFFSET $3`,
          [...values, (q.page - 1) * 25],
        )
      ).rows,
      total: Number(
        (
          await pool.query(
            `SELECT count(*) FROM subscribers s ${where}`,
            values,
          )
        ).rows[0].count,
      ),
    };
  });
  for (const [path, kind] of [
    ["subscribers", "subscriber"],
    ["services", "service"],
    ["plans", "plan"],
  ] as const) {
    post(`/${path}/account-number`, "subscriber.edit", async (req: any) =>
      transaction((db) => reserveIdentifier(db, kind, req.actor.id)),
    );
  }
  post("/subscribers", "subscriber.edit", async (req: any) => {
    const b = z
      .object({
        identifierToken: z.uuid().optional(),
        name: text,
        contact: z.string().max(50),
        address: text,
        areaId: id,
        collectorId: id,
        billingDay: z.number().int().min(1).max(28),
        dueDay: z.number().int().min(1).max(28),
        notes: z.string().max(1000).default(""),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO subscribers(account_no,name,contact,address,area_id,collector_id,billing_day,due_day,notes) VALUES(COALESCE($9,next_subscriber_account_no()),$1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            b.name,
            b.contact,
            b.address,
            b.areaId,
            b.collectorId,
            b.billingDay,
            b.dueDay,
            b.notes,
            await consumeIdentifier(
              db,
              "subscriber",
              req.actor.id,
              b.identifierToken,
            ),
          ],
        )
      ).rows[0];
      await audit(
        db,
        req.actor.id,
        "subscriber.create",
        "subscribers",
        r.id,
        r,
      );
      return r;
    });
  });
  post("/subscribers/:id/status", "subscriber.edit", async (req: any) => {
    const b = z
      .object({
        status: z.enum(["ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"]),
        reason,
      })
      .parse(req.body);
    return transaction(async (db) => {
      await lockSubscriber(db, id.parse(req.params.id));
      await db.query("UPDATE subscribers SET status=$1 WHERE id=$2", [
        b.status,
        req.params.id,
      ]);
      await audit(
        db,
        req.actor.id,
        "subscriber.status",
        "subscribers",
        req.params.id,
        b,
        b.reason,
      );
      return { ok: true };
    });
  });
  post("/subscribers/:id/edit", "subscriber.edit", async (req: any) => {
    const b = z
      .object({
        name: text,
        contact: z.string().max(50),
        address: text,
        areaId: id,
        collectorId: id,
        billingDay: z.number().int().min(1).max(28),
        dueDay: z.number().int().min(1).max(28),
        notes: z.string().max(1000).default(""),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await lockSubscriber(db, id.parse(req.params.id));
      const old = (
        await db.query("SELECT * FROM subscribers WHERE id=$1", [req.params.id])
      ).rows[0];
      const r = (
        await db.query(
          "UPDATE subscribers SET account_no=$1,name=$2,contact=$3,address=$4,area_id=$5,collector_id=$6,billing_day=$7,due_day=$8,notes=$9 WHERE id=$10 RETURNING *",
          [
            old.account_no,
            b.name,
            b.contact,
            b.address,
            b.areaId,
            b.collectorId,
            b.billingDay,
            b.dueDay,
            b.notes,
            req.params.id,
          ],
        )
      ).rows[0];
      await audit(db, req.actor.id, "subscriber.edit", "subscribers", r.id, {
        before: old,
        after: r,
      });
      return r;
    });
  });
  post("/plans/:id/edit", "subscriber.edit", async (req: any) => {
    const b = z
      .object({
        name: text,
        type: z.enum(["Internet", "Cable", "Combo"]),
        price: amount,
        fee: z.number().int().nonnegative().max(999999999999),
        speed: z.number().int().nonnegative().nullable(),
        channels: z.number().int().nonnegative().nullable(),
        description: z.string().max(1000),
        active: z.boolean(),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const old = (
        await db.query("SELECT * FROM service_plans WHERE id=$1 FOR UPDATE", [
          id.parse(req.params.id),
        ])
      ).rows[0];
      if (!old) throw new Error("Plan not found");
      const r = (
        await db.query(
          "UPDATE service_plans SET code=$1,name=$2,type=$3,price=$4,fee=$5,speed=$6,channels=$7,description=$8,active=$9 WHERE id=$10 RETURNING *",
          [
            old.code,
            b.name,
            b.type,
            b.price,
            b.fee,
            b.speed,
            b.channels,
            b.description,
            b.active,
            old.id,
          ],
        )
      ).rows[0];
      await audit(db, req.actor.id, "plan.edit", "service_plans", r.id, {
        before: old,
        after: r,
      });
      return r;
    });
  });
  post("/services/:id/rate", "subscriber.edit", async (req: any) => {
    const b = z.object({ rate: amount, reason }).parse(req.body);
    return transaction(async (db) => {
      const old = (
        await db.query("SELECT * FROM service_accounts WHERE id=$1", [
          id.parse(req.params.id),
        ])
      ).rows[0];
      if (!old) throw new Error("Service not found");
      await lockSubscriber(db, old.subscriber_id);
      await db.query("UPDATE service_accounts SET rate=$1 WHERE id=$2", [
        b.rate,
        old.id,
      ]);
      await db.query(
        "INSERT INTO service_events(service_id,kind,reason,actor_id) VALUES($1,'RATE_CHANGED',$2,$3)",
        [old.id, b.reason, req.actor.id],
      );
      await audit(
        db,
        req.actor.id,
        "service.rate",
        "service_accounts",
        old.id,
        { before: old.rate, after: b.rate },
        b.reason,
      );
      return { ok: true };
    });
  });
  get("/subscribers/:id", "subscriber.view", async (req: any) =>
    transaction(async (db) => {
      const n = id.parse(req.params.id);
      await lockSubscriber(db, n);
      const subscriber = (
        await db.query("SELECT * FROM subscribers WHERE id=$1", [n])
      ).rows[0];
      return {
        subscriber,
        services: (
          await db.query(
            "SELECT s.*,p.name AS plan,p.type FROM service_accounts s JOIN service_plans p ON p.id=s.plan_id WHERE subscriber_id=$1",
            [n],
          )
        ).rows,
        invoices: (
          await db.query(
            "SELECT * FROM invoice_balances WHERE subscriber_id=$1 ORDER BY period DESC LIMIT 100",
            [n],
          )
        ).rows,
        payments: (
          await db.query(
            "SELECT * FROM payments WHERE subscriber_id=$1 ORDER BY paid_at DESC LIMIT 100",
            [n],
          )
        ).rows,
        ledger: await ledger(db, n),
        history: (
          await db.query(
            "SELECT e.* FROM service_events e JOIN service_accounts s ON s.id=e.service_id WHERE s.subscriber_id=$1 ORDER BY e.created_at DESC",
            [n],
          )
        ).rows,
        proofs: (
          await db.query(
            "SELECT id,reference,amount,status,created_at FROM payment_proofs WHERE subscriber_id=$1",
            [n],
          )
        ).rows,
        collections: (
          await db.query(
            "SELECT b.id,b.status,c.name AS collector,a.expected FROM batch_accounts a JOIN collection_batches b ON b.id=a.batch_id JOIN collectors c ON c.id=b.collector_id WHERE a.subscriber_id=$1 ORDER BY b.id DESC LIMIT 100",
            [n],
          )
        ).rows,
        audit: req.actor.permissions.some((p: string) =>
          ["*", "audit.view"].includes(p),
        )
          ? (
              await db.query(
                "SELECT * FROM audit_logs WHERE (entity='subscribers' AND entity_id=$1) OR (entity='payments' AND entity_id IN (SELECT id::text FROM payments WHERE subscriber_id=$2)) ORDER BY id DESC LIMIT 100",
                [String(n), n],
              )
            ).rows
          : [],
      };
    }),
  );
  post("/plans", "subscriber.edit", async (req: any) => {
    const b = z
      .object({
        identifierToken: z.uuid().optional(),
        name: text,
        type: z.enum(["Internet", "Cable", "Combo"]),
        price: amount,
        speed: z.number().int().nonnegative().optional(),
        channels: z.number().int().nonnegative().optional(),
        fee: z.number().int().nonnegative().default(0),
        description: z.string().max(1000).default(""),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO service_plans(code,name,type,price,speed,channels,fee,description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            await consumeIdentifier(
              db,
              "plan",
              req.actor.id,
              b.identifierToken,
            ),
            b.name,
            b.type,
            b.price,
            b.speed,
            b.channels,
            b.fee,
            b.description,
          ],
        )
      ).rows[0];
      await audit(db, req.actor.id, "plan.create", "service_plans", r.id, b);
      return r;
    });
  });
  post("/services", "subscriber.edit", async (req: any) => {
    const b = z
      .object({
        subscriberId: id,
        planId: id,
        identifierToken: z.uuid().optional(),
        address: text,
        rate: amount,
        activationDate: z.iso.date(),
        billingStart: z.iso.date(),
        dueDay: z.number().int().min(1).max(28),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await lockSubscriber(db, b.subscriberId);
      const r = (
        await db.query(
          "INSERT INTO service_accounts(subscriber_id,plan_id,account_no,address,rate,activation_date,billing_start,due_day) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
          [
            b.subscriberId,
            b.planId,
            await consumeIdentifier(
              db,
              "service",
              req.actor.id,
              b.identifierToken,
            ),
            b.address,
            b.rate,
            b.activationDate,
            b.billingStart,
            b.dueDay,
          ],
        )
      ).rows[0];
      await audit(
        db,
        req.actor.id,
        "service.create",
        "service_accounts",
        r.id,
        b,
      );
      return r;
    });
  });
  get("/services", "service.view", async (req: any) => {
    const q = z
      .object({ page: z.coerce.number().int().positive().default(1) })
      .parse(req.query);
    return (
      await pool.query(
        "SELECT s.*,p.name AS plan FROM service_accounts s JOIN service_plans p ON p.id=s.plan_id ORDER BY s.id LIMIT 50 OFFSET $1",
        [(q.page - 1) * 50],
      )
    ).rows;
  });
  post("/services/:id/state", "service.manage", async (req: any) => {
    const b = z
      .object({
        status: z.enum(["SUSPENDED", "ACTIVE", "TERMINATED"]),
        reason,
        technicianId: id.optional(),
      })
      .parse(req.body);
    return transaction(async (db) => {
      const s = (
        await db.query(
          "SELECT * FROM service_accounts WHERE id=$1 FOR UPDATE",
          [id.parse(req.params.id)],
        )
      ).rows[0];
      if (!s) throw new Error("Service account not found");
      if (s.status === b.status)
        throw new Error("Service already has this status");
      if (b.status === "ACTIVE") {
        const debt = (
          await db.query(
            "SELECT COALESCE(sum(balance),0) AS total FROM invoice_balances WHERE service_id=$1 AND due_date<CURRENT_DATE AND status NOT IN ('VOID','DRAFT')",
            [s.id],
          )
        ).rows[0];
        if (Number(debt.total) > 0)
          throw new Error(
            "Clear overdue service charges before requesting reconnection",
          );
        const r = await db.query(
          "INSERT INTO reconnection_records(service_id,technician_id) VALUES($1,$2) RETURNING id",
          [s.id, b.technicianId || null],
        );
        await audit(
          db,
          req.actor.id,
          "service.reconnection.request",
          "reconnection_records",
          r.rows[0].id,
          b,
          b.reason,
        );
        return {
          message: "Reconnection requested; technician completion required",
        };
      }
      await db.query("UPDATE service_accounts SET status=$1 WHERE id=$2", [
        b.status,
        s.id,
      ]);
      if (b.status === "SUSPENDED")
        await db.query(
          "INSERT INTO suspension_records(service_id,reason,approved_by,effective_date) VALUES($1,$2,$3,CURRENT_DATE)",
          [s.id, b.reason, req.actor.id],
        );
      await db.query(
        "INSERT INTO service_events(service_id,kind,reason,actor_id) VALUES($1,$2,$3,$4)",
        [s.id, b.status, b.reason, req.actor.id],
      );
      await audit(
        db,
        req.actor.id,
        "service.state",
        "service_accounts",
        s.id,
        b,
        b.reason,
      );
      return { ok: true };
    });
  });
  get(
    "/suspension-candidates",
    "service.view",
    async () =>
      (
        await pool.query(
          `SELECT s.id,s.account_no,s.address,s.status,u.name,min(i.due_date) AS oldest_due,sum(i.balance) AS outstanding FROM service_accounts s JOIN subscribers u ON u.id=s.subscriber_id JOIN invoice_balances i ON i.service_id=s.id WHERE s.status='ACTIVE' AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT') AND CURRENT_DATE-i.due_date>=COALESCE((SELECT (value->>'suspensionDays')::int FROM application_settings WHERE key='service_policy'),60)+COALESCE((SELECT (value->>'graceDays')::int FROM application_settings WHERE key='service_policy'),7) GROUP BY s.id,u.name ORDER BY min(i.due_date) LIMIT 100`,
        )
      ).rows,
  );
  get(
    "/reconnections",
    "service.view",
    async () =>
      (
        await pool.query(
          "SELECT * FROM reconnection_records ORDER BY requested_at DESC LIMIT 100",
        )
      ).rows,
  );
  post("/reconnections/:id/complete", "service.complete", async (req: any) =>
    transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM reconnection_records WHERE id=$1 FOR UPDATE",
          [id.parse(req.params.id)],
        )
      ).rows[0];
      if (!r || r.completed_at) throw new Error("No pending reconnection");
      if (
        r.technician_id &&
        r.technician_id !== req.actor.id &&
        !req.actor.permissions.includes("*")
      )
        throw new Error("This request is assigned to another technician");
      const overdue = Number(
        (
          await db.query(
            "SELECT COALESCE(sum(balance),0) AS total FROM invoice_balances WHERE service_id=$1 AND due_date<CURRENT_DATE AND status NOT IN ('VOID','DRAFT')",
            [r.service_id],
          )
        ).rows[0].total,
      );
      if (overdue > 0)
        throw new Error("Overdue charges must be cleared before reconnection");
      await db.query(
        "UPDATE reconnection_records SET completed_at=now() WHERE id=$1",
        [r.id],
      );
      await db.query(
        "UPDATE service_accounts SET status='ACTIVE' WHERE id=$1",
        [r.service_id],
      );
      await db.query(
        "INSERT INTO service_events(service_id,kind,reason,actor_id) VALUES($1,'RECONNECTED','Technician completed reconnection',$2)",
        [r.service_id, req.actor.id],
      );
      await audit(
        db,
        req.actor.id,
        "service.reconnect",
        "service_accounts",
        r.service_id,
        r,
      );
      return { ok: true };
    }),
  );
  post("/billing/generate", "billing.generate", async (req: any) => {
    const b = z
      .object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-01$/) })
      .parse(req.body);
    return transaction((db) => generateBilling(db, b.period, req.actor.id));
  });
  get("/invoices", "subscriber.view", async (req: any) => {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        search: z.string().max(100).default(""),
      })
      .parse(req.query);
    return (
      await pool.query(
        "SELECT b.*,s.name FROM invoice_balances b JOIN subscribers s ON s.id=b.subscriber_id WHERE s.name ILIKE $1 OR b.number ILIKE $1 ORDER BY period DESC,b.id DESC LIMIT 50 OFFSET $2",
        [`%${q.search}%`, (q.page - 1) * 50],
      )
    ).rows;
  });
  post("/invoices/:id/adjust", "payment.reverse", async (req: any) => {
    const b = z
      .object({
        amount: z
          .number()
          .int()
          .min(-999999999999)
          .max(999999999999)
          .refine((n) => n !== 0),
        reason,
      })
      .parse(req.body);
    return transaction(async (db) => {
      const i = (
        await db.query("SELECT * FROM invoice_balances WHERE id=$1", [
          id.parse(req.params.id),
        ])
      ).rows[0];
      if (!i) throw new Error("Invoice not found");
      if (["VOID", "DRAFT", "CREDITED"].includes(i.status))
        throw new Error("Only finalized active invoices may be adjusted");
      await lockSubscriber(db, i.subscriber_id);
      const latest = (
        await db.query("SELECT * FROM invoice_balances WHERE id=$1", [i.id])
      ).rows[0];
      if (
        Number(latest.total) + Number(latest.adjusted) + b.amount >
        999999999999
      )
        throw new Error("Adjusted total exceeds the supported amount");
      if (Number(latest.balance) + b.amount < 0)
        throw new Error(
          "Adjustment cannot reduce invoice below allocated payments",
        );
      await db.query(
        "INSERT INTO adjustments(invoice_id,amount,reason,actor_id) VALUES($1,$2,$3,$4)",
        [i.id, b.amount, b.reason, req.actor.id],
      );
      await applyCredit(db, i.subscriber_id);
      await audit(
        db,
        req.actor.id,
        "invoice.adjust",
        "invoices",
        i.id,
        b,
        b.reason,
      );
      return { ok: true };
    });
  });
  post("/invoices/:id/void", "payment.reverse", async (req: any) => {
    const b = z.object({ reason }).parse(req.body);
    return transaction(async (db) => {
      const initial = (
        await db.query("SELECT * FROM invoice_balances WHERE id=$1", [
          id.parse(req.params.id),
        ])
      ).rows[0];
      if (!initial) throw new Error("Invoice not found");
      await lockSubscriber(db, initial.subscriber_id);
      const i = (
        await db.query("SELECT * FROM invoice_balances WHERE id=$1", [
          initial.id,
        ])
      ).rows[0];
      if (["VOID", "CREDITED", "DRAFT"].includes(i.status))
        throw new Error("Invoice is not eligible for void");
      if (Number(i.balance) !== Number(i.total) + Number(i.adjusted))
        throw new Error("Reverse allocated payments before voiding an invoice");
      await db.query(
        "INSERT INTO adjustments(invoice_id,amount,reason,actor_id) VALUES($1,$2,$3,$4)",
        [i.id, -Number(i.balance), "VOID: " + b.reason, req.actor.id],
      );
      await db.query("UPDATE invoices SET status='VOID' WHERE id=$1", [i.id]);
      await audit(
        db,
        req.actor.id,
        "invoice.void",
        "invoices",
        i.id,
        i,
        b.reason,
      );
      return { ok: true };
    });
  });
  post("/payments", "payment.create", async (req: any) => {
    const b = paymentSchema.parse(req.body);
    if (b.method === "GCash")
      throw new Error(
        "Use the GCash verification queue to post verified payments",
      );
    return transaction((db) => postPayment(db, b, req.actor.id));
  });
  get("/payments", "subscriber.view", async (req: any) => {
    const q = z
      .object({ page: z.coerce.number().int().positive().default(1) })
      .parse(req.query);
    return (
      await pool.query(
        "SELECT p.*,s.name FROM payments p JOIN subscribers s ON s.id=p.subscriber_id ORDER BY paid_at DESC,id DESC LIMIT 50 OFFSET $1",
        [(q.page - 1) * 50],
      )
    ).rows;
  });
  post("/payments/:id/reverse", "payment.reverse", async (req: any) => {
    const b = z.object({ reason }).parse(req.body);
    return transaction((db) =>
      reversePayment(db, id.parse(req.params.id), b.reason, req.actor.id),
    );
  });
  get(
    "/proofs",
    "payment.verify",
    async () =>
      (
        await pool.query(
          "SELECT p.*,s.name FROM payment_proofs p JOIN subscribers s ON s.id=p.subscriber_id ORDER BY p.created_at DESC LIMIT 100",
        )
      ).rows,
  );
  post("/proofs", "payment.create", async (req: any) => {
    const b = z
      .object({
        subscriberId: id,
        reference: z
          .string()
          .trim()
          .min(6)
          .max(100)
          .transform((s) => s.toUpperCase()),
        sender: text,
        amount,
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO payment_proofs(subscriber_id,reference,sender,amount) VALUES($1,$2,$3,$4) RETURNING *",
          [b.subscriberId, b.reference, b.sender, b.amount],
        )
      ).rows[0];
      await audit(db, req.actor.id, "proof.record", "payment_proofs", r.id, b);
      return r;
    });
  });
  post("/proofs/:id/upload", "payment.create", async (req: any) => {
    const n = id.parse(req.params.id);
    const file = await req.file();
    if (!file) throw new Error("Choose a PNG or JPEG proof image");
    const bytes = await file.toBuffer();
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg)
      throw new Error("Only valid PNG and JPEG images are supported");
    const filename = randomUUID() + (png ? ".png" : ".jpg");
    const dir = path.resolve(
      process.env.STORAGE_DIR || "storage",
      "attachments",
    );
    await mkdir(dir, { recursive: true });
    return transaction(async (db) => {
      const p = (
        await db.query("SELECT * FROM payment_proofs WHERE id=$1 FOR UPDATE", [
          n,
        ])
      ).rows[0];
      if (!p || p.status !== "PENDING")
        throw new Error("Only pending proofs can receive attachments");
      await writeFile(path.join(dir, filename), bytes, { flag: "wx" });
      await db.query("UPDATE payment_proofs SET path=$1,mime=$2 WHERE id=$3", [
        filename,
        png ? "image/png" : "image/jpeg",
        n,
      ]);
      await audit(db, req.actor.id, "proof.upload", "payment_proofs", n, {
        filename,
      });
      return { ok: true };
    });
  });
  get("/proofs/:id/image", "payment.verify", async (req: any, reply: any) => {
    const p = (
      await pool.query("SELECT path,mime FROM payment_proofs WHERE id=$1", [
        id.parse(req.params.id),
      ])
    ).rows[0];
    if (!p?.path)
      return reply.code(404).send({ error: "No proof image uploaded" });
    return reply
      .type(p.mime)
      .send(
        await readFile(
          path.resolve(
            process.env.STORAGE_DIR || "storage",
            "attachments",
            path.basename(p.path),
          ),
        ),
      );
  });
  post("/proofs/:id/review", "payment.verify", async (req: any) => {
    const b = z
      .object({ decision: z.enum(["VERIFIED", "REJECTED"]), reason })
      .parse(req.body);
    return transaction(async (db) => {
      const initial = (
        await db.query("SELECT * FROM payment_proofs WHERE id=$1", [
          id.parse(req.params.id),
        ])
      ).rows[0];
      if (!initial) throw new Error("Proof not found");
      await lockSubscriber(db, initial.subscriber_id);
      const p = (
        await db.query("SELECT * FROM payment_proofs WHERE id=$1 FOR UPDATE", [
          initial.id,
        ])
      ).rows[0];
      if (p.status !== "PENDING") throw new Error("Proof was already reviewed");
      if (b.decision === "VERIFIED" && !p.path)
        throw new Error("Upload the proof image before verification");
      await db.query(
        "UPDATE payment_proofs SET status=$1,reviewed_by=$2,reviewed_at=now(),reason=$3 WHERE id=$4",
        [b.decision, req.actor.id, b.reason, p.id],
      );
      await audit(
        db,
        req.actor.id,
        "proof.review",
        "payment_proofs",
        p.id,
        b,
        b.reason,
      );
      if (b.decision === "VERIFIED")
        return postPayment(
          db,
          {
            subscriberId: p.subscriber_id,
            amount: Number(p.amount),
            method: "GCash",
            reference: p.reference,
            proofId: p.id,
            idempotencyKey: randomUUID(),
          },
          req.actor.id,
        );
      return { ok: true };
    });
  });
  get(
    "/batches",
    "collection.view",
    async () =>
      (
        await pool.query(
          `SELECT b.*,c.name AS collector,a.name AS area,r.remitted_cash,r.difference,COALESCE((SELECT sum(amount) FROM payments p WHERE p.batch_id=b.id AND method='Cash' AND NOT reversed),0) AS cash,COALESCE((SELECT sum(amount) FROM payments p WHERE p.batch_id=b.id AND method<>'Cash' AND NOT reversed),0) AS noncash FROM collection_batches b JOIN collectors c ON c.id=b.collector_id LEFT JOIN collection_areas a ON a.id=b.area_id LEFT JOIN collector_remittances r ON r.batch_id=b.id ORDER BY b.id DESC LIMIT 100`,
        )
      ).rows,
  );
  post("/areas", "collection.manage", async (req: any) => {
    const b = z.object({ name: text }).parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO collection_areas(name) VALUES($1) RETURNING *",
          [b.name],
        )
      ).rows[0];
      await audit(db, req.actor.id, "area.create", "collection_areas", r.id, b);
      return r;
    });
  });
  post("/collectors", "collection.manage", async (req: any) => {
    const b = z.object({ name: text }).parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query("INSERT INTO collectors(name) VALUES($1) RETURNING *", [
          b.name,
        ])
      ).rows[0];
      await audit(db, req.actor.id, "collector.create", "collectors", r.id, b);
      return r;
    });
  });
  post("/batches", "collection.manage", async (req: any) => {
    const b = z.object({ collectorId: id, areaId: id }).parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO collection_batches(collector_id,area_id) VALUES($1,$2) RETURNING *",
          [b.collectorId, b.areaId],
        )
      ).rows[0];
      await db.query(
        `INSERT INTO batch_accounts(batch_id,subscriber_id,expected) SELECT $1,s.id,COALESCE(sum(i.balance),0) FROM subscribers s LEFT JOIN invoice_balances i ON i.subscriber_id=s.id AND i.status NOT IN ('VOID','DRAFT') WHERE s.collector_id=$2 AND s.area_id=$3 GROUP BY s.id`,
        [r.id, b.collectorId, b.areaId],
      );
      await db.query(
        "UPDATE collection_batches SET expected=(SELECT COALESCE(sum(expected),0) FROM batch_accounts WHERE batch_id=$1) WHERE id=$1",
        [r.id],
      );
      await audit(
        db,
        req.actor.id,
        "batch.create",
        "collection_batches",
        r.id,
        b,
      );
      return r;
    });
  });
  get(
    "/batches/:id/route",
    "collection.view",
    async (req: any) =>
      (
        await pool.query(
          "SELECT s.account_no,s.name,s.address,b.expected FROM batch_accounts b JOIN subscribers s ON s.id=b.subscriber_id WHERE b.batch_id=$1 ORDER BY s.address,s.name",
          [id.parse(req.params.id)],
        )
      ).rows,
  );
  post("/batches/:id/transition", "collection.reconcile", async (req: any) => {
    const b = z
      .object({ status: z.enum(["SUBMITTED", "RECONCILED", "CLOSED"]), reason })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM collection_batches WHERE id=$1 FOR UPDATE",
          [id.parse(req.params.id)],
        )
      ).rows[0];
      if (!r) throw new Error("Batch not found");
      const allowed: Record<string, string[]> = {
        SUBMITTED: ["OPEN", "IN_PROGRESS"],
        RECONCILED: ["REMITTED"],
        CLOSED: ["RECONCILED"],
      };
      if (!allowed[b.status].includes(r.status))
        throw new Error(`Cannot change ${r.status} to ${b.status}`);
      await db.query(
        "UPDATE collection_batches SET status=$1,closed_by=CASE WHEN $1='CLOSED' THEN $2 ELSE closed_by END WHERE id=$3",
        [b.status, req.actor.id, r.id],
      );
      await audit(
        db,
        req.actor.id,
        "batch." + b.status.toLowerCase(),
        "collection_batches",
        r.id,
        b,
        b.reason,
      );
      return { ok: true };
    });
  });
  post("/batches/:id/remit", "collection.reconcile", async (req: any) => {
    const b = z
      .object({
        amount: z.number().int().nonnegative().max(999999999999),
        reason,
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "SELECT * FROM collection_batches WHERE id=$1 FOR UPDATE",
          [id.parse(req.params.id)],
        )
      ).rows[0];
      if (!r || r.status !== "SUBMITTED")
        throw new Error("Submit the collection batch before remittance");
      const cash = Number(
        (
          await db.query(
            "SELECT COALESCE(sum(amount),0) AS total FROM payments WHERE batch_id=$1 AND method='Cash' AND NOT reversed",
            [r.id],
          )
        ).rows[0].total,
      );
      await db.query(
        "INSERT INTO collector_remittances(batch_id,expected_cash,remitted_cash,difference,notes,actor_id) VALUES($1,$2,$3,$4,$5,$6)",
        [r.id, cash, b.amount, b.amount - cash, b.reason, req.actor.id],
      );
      await db.query(
        "UPDATE collection_batches SET status='REMITTED' WHERE id=$1",
        [r.id],
      );
      await audit(
        db,
        req.actor.id,
        "batch.remit",
        "collection_batches",
        r.id,
        { cash, remitted: b.amount, difference: b.amount - cash },
        b.reason,
      );
      return { cash, remitted: b.amount, difference: b.amount - cash };
    });
  });
  get("/receivables", "report.view", async (req: any) => {
    const q = z
      .object({
        area: id.optional(),
        collector: id.optional(),
        plan: id.optional(),
        type: z.enum(["Internet", "Cable", "Combo"]).optional(),
        minDays: z.coerce.number().int().nonnegative().default(0),
        page: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    return (
      await pool.query(
        `SELECT s.id,s.account_no,s.name,a.name AS area,c.name AS collector,min(i.due_date) AS oldest_due,count(*) AS unpaid_invoices,sum(i.balance) AS outstanding,(SELECT max(p.paid_at) FROM payments p WHERE p.subscriber_id=s.id AND NOT p.reversed) AS last_payment FROM invoice_balances i JOIN subscribers s ON s.id=i.subscriber_id JOIN service_plans p ON p.id=i.plan_id LEFT JOIN collection_areas a ON a.id=s.area_id LEFT JOIN collectors c ON c.id=s.collector_id WHERE i.balance>0 AND i.status NOT IN ('VOID','DRAFT') AND ($1::int IS NULL OR s.area_id=$1) AND ($2::int IS NULL OR s.collector_id=$2) AND ($3::int IS NULL OR i.plan_id=$3) AND ($4::text IS NULL OR p.type=$4) AND ($5::int=0 OR CURRENT_DATE-i.due_date >=$5) GROUP BY s.id,a.name,c.name ORDER BY min(i.due_date),s.name LIMIT 50 OFFSET $6`,
        [
          q.area || null,
          q.collector || null,
          q.plan || null,
          q.type || null,
          q.minDays,
          (q.page - 1) * 50,
        ],
      )
    ).rows;
  });
  get("/dashboard", "report.view", async () => {
    const k = (
      await pool.query(
        `SELECT (SELECT count(*) FROM subscribers WHERE status='ACTIVE') AS subscribers,(SELECT COALESCE(sum(balance),0) FROM invoice_balances WHERE status NOT IN ('VOID','DRAFT')) AS receivable,(SELECT COALESCE(sum(balance),0) FROM invoice_balances WHERE due_date<CURRENT_DATE AND status NOT IN ('VOID','DRAFT')) AS overdue,(SELECT count(DISTINCT subscriber_id) FROM invoice_balances WHERE due_date<CURRENT_DATE AND balance>0 AND status NOT IN ('VOID','DRAFT')) AS overdue_accounts,(SELECT COALESCE(sum(amount),0) FROM payments WHERE paid_at>=date_trunc('month',now()) AND NOT reversed) AS collected,(SELECT count(*) FROM payment_proofs WHERE status='PENDING') AS pending_proofs`,
      )
    ).rows[0];
    return {
      kpis: k,
      methods: (
        await pool.query(
          "SELECT method,sum(amount) AS total FROM payments WHERE NOT reversed AND paid_at>=date_trunc('month',now()) GROUP BY method ORDER BY total DESC",
        )
      ).rows,
      aging: (
        await pool.query(
          `SELECT CASE WHEN due_date>=CURRENT_DATE THEN 'Current' WHEN CURRENT_DATE-due_date<=30 THEN '1–30' WHEN CURRENT_DATE-due_date<=60 THEN '31–60' WHEN CURRENT_DATE-due_date<=90 THEN '61–90' ELSE '90+' END AS bucket,sum(balance) AS total FROM invoice_balances WHERE balance>0 AND status NOT IN ('VOID','DRAFT') GROUP BY bucket`,
        )
      ).rows,
      trend: (
        await pool.query(
          `SELECT to_char(m,'Mon') AS month,COALESCE((SELECT sum(total) FROM invoices WHERE period=m AND status NOT IN ('VOID','DRAFT')),0) AS billed,COALESCE((SELECT sum(amount) FROM payments WHERE paid_at>=m AND paid_at<m+interval '1 month' AND NOT reversed),0) AS collected FROM generate_series(date_trunc('month',now())-interval '5 months',date_trunc('month',now()),interval '1 month') m`,
        )
      ).rows,
      recent: (
        await pool.query(
          "SELECT p.receipt_no,p.amount,p.method,p.paid_at,s.name FROM payments p JOIN subscribers s ON s.id=p.subscriber_id WHERE NOT reversed ORDER BY p.id DESC LIMIT 6",
        )
      ).rows,
      collectors: (
        await pool.query(
          `SELECT c.name,count(DISTINCT p.subscriber_id) AS accounts,COALESCE(sum(p.amount),0) AS total FROM collectors c LEFT JOIN collection_batches b ON b.collector_id=c.id LEFT JOIN payments p ON p.batch_id=b.id AND NOT p.reversed GROUP BY c.id ORDER BY total DESC`,
        )
      ).rows,
    };
  });
  get("/reports/:type", "report.export", async (req: any, reply: any) => {
    const q = z
      .object({
        format: z.enum(["pdf", "xlsx"]),
        from: z.iso.date().default("2000-01-01"),
        to: z.iso.date().default("2100-01-01"),
        subscriberId: id.optional(),
      })
      .parse(req.query);
    const result = await exportReport(req.params.type, q);
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="bcis-${req.params.type}.${q.format}"`,
      )
      .type(
        q.format === "pdf"
          ? "application/pdf"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .send(result);
  });
  get("/audit", "audit.view", async (req: any) => {
    const q = z
      .object({ page: z.coerce.number().int().positive().default(1) })
      .parse(req.query);
    return (
      await pool.query(
        "SELECT a.*,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 50 OFFSET $1",
        [(q.page - 1) * 50],
      )
    ).rows;
  });
  get(
    "/users",
    "user.manage",
    async () =>
      (
        await pool.query(
          "SELECT u.id,u.username,u.name,u.active,array_agg(r.role_id) AS roles FROM users u LEFT JOIN user_roles r ON r.user_id=u.id GROUP BY u.id ORDER BY u.id",
        )
      ).rows,
  );
  post("/users", "user.manage", async (req: any) => {
    const b = z
      .object({
        username: text,
        name: text,
        password: z.string().min(12).max(200),
        role: z.enum([
          "Owner",
          "Administrator",
          "Cashier",
          "Collection Supervisor",
          "Auditor",
          "Technician",
          "Viewer",
        ]),
      })
      .parse(req.body);
    const hash = hashPassword(b.password);
    return transaction(async (db) => {
      const u = (
        await db.query(
          "INSERT INTO users(username,name,password_hash) VALUES($1,$2,$3) RETURNING id,username,name",
          [b.username, b.name, hash],
        )
      ).rows[0];
      await db.query("INSERT INTO user_roles VALUES($1,$2)", [u.id, b.role]);
      await audit(db, req.actor.id, "user.create", "users", u.id, {
        username: b.username,
        role: b.role,
      });
      return u;
    });
  });
  post("/users/:id/active", "user.manage", async (req: any) => {
    const b = z.object({ active: z.boolean() }).parse(req.body);
    const n = id.parse(req.params.id);
    if (n === req.actor.id && !b.active)
      throw new Error("You cannot deactivate your own account");
    return transaction(async (db) => {
      await db.query("UPDATE users SET active=$1 WHERE id=$2", [b.active, n]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [n]);
      await audit(db, req.actor.id, "user.status", "users", n, b);
      return { ok: true };
    });
  });
  get(
    "/settings",
    "user.manage",
    async () => (await pool.query("SELECT * FROM application_settings")).rows,
  );
  post("/settings", "user.manage", async (req: any) => {
    const b = z
      .object({
        graceDays: z.number().int().min(0).max(90),
        suspensionDays: z.number().int().min(1).max(365),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await db.query(
        "INSERT INTO application_settings(key,value) VALUES('service_policy',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(b)],
      );
      await audit(
        db,
        req.actor.id,
        "settings.update",
        "application_settings",
        "service_policy",
        b,
      );
      return { ok: true };
    });
  });
  get(
    "/backups",
    "backup.restore",
    async () =>
      (
        await pool.query(
          "SELECT * FROM backup_history ORDER BY id DESC LIMIT 30",
        )
      ).rows,
  );
  post("/backups", "backup.restore", async (req: any) =>
    createBackup(req.actor.id),
  );
  return app;
}

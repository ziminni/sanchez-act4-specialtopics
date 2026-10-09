import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import { ledger, lockSubscriber } from "../services/finance.js";
import {
  reserveIdentifier,
  consumeIdentifier,
} from "../services/identifiers.js";
import { id, amount, reason, text } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerSubscriberRoutes({ get, post }: RouteContext) {
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
}

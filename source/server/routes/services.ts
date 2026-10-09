import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import { id, reason } from "../http/schemas.js";
import { seesMoney, withoutMoney } from "../http/access.js";
import type { RouteContext } from "../http/route-context.js";

export function registerServiceRoutes({ get, post }: RouteContext) {
  get("/services", "service.view", async (req: any) => {
    const q = z
      .object({ page: z.coerce.number().int().positive().default(1) })
      .parse(req.query);
    const rows = (
      await pool.query(
        "SELECT s.*,p.name AS plan FROM service_accounts s JOIN service_plans p ON p.id=s.plan_id ORDER BY s.id LIMIT 50 OFFSET $1",
        [(q.page - 1) * 50],
      )
    ).rows;
    return seesMoney(req) ? rows : withoutMoney(rows, ["rate"]);
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
  get("/suspension-candidates", "service.view", async (req: any) => {
    const rows = (
      await pool.query(
        `SELECT s.id,s.account_no,s.address,s.status,u.name,min(i.due_date) AS oldest_due,sum(i.balance) AS outstanding FROM service_accounts s JOIN subscribers u ON u.id=s.subscriber_id JOIN invoice_balances i ON i.service_id=s.id WHERE s.status='ACTIVE' AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT') AND CURRENT_DATE-i.due_date>=COALESCE((SELECT (value->>'suspensionDays')::int FROM application_settings WHERE key='service_policy'),60)+COALESCE((SELECT (value->>'graceDays')::int FROM application_settings WHERE key='service_policy'),7) GROUP BY s.id,u.name ORDER BY min(i.due_date) LIMIT 100`,
      )
    ).rows;
    return seesMoney(req) ? rows : withoutMoney(rows, ["outstanding"]);
  });
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
}

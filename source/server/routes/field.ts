import { z } from "zod";
import { pool } from "../db.js";
import type { RouteContext } from "../http/route-context.js";

const fieldService = `SELECT s.id,s.account_no,s.status,s.address,s.activation_date,p.name AS plan,p.type AS plan_type,u.id AS subscriber_id,u.name AS subscriber,u.contact,a.name AS area
  FROM service_accounts s JOIN service_plans p ON p.id=s.plan_id JOIN subscribers u ON u.id=s.subscriber_id LEFT JOIN collection_areas a ON a.id=u.area_id`;

const overdueClear = `NOT EXISTS(SELECT 1 FROM invoice_balances i WHERE i.service_id=r.service_id AND i.due_date<CURRENT_DATE AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT'))`;

export function registerFieldRoutes({ get }: RouteContext) {
  get("/field/overview", "service.view", async (req: any) => {
    const [status, recon, events, queue, candidates] = await Promise.all([
      pool.query(
        "SELECT count(*) FILTER (WHERE status='ACTIVE') AS active,count(*) FILTER (WHERE status='SUSPENDED') AS suspended,count(*) FILTER (WHERE status='TERMINATED') AS terminated FROM service_accounts",
      ),
      pool.query(
        `SELECT count(*) FILTER (WHERE completed_at IS NULL) AS pending,
          count(*) FILTER (WHERE completed_at IS NULL AND technician_id=$1) AS mine,
          count(*) FILTER (WHERE completed_at IS NULL AND technician_id IS NULL) AS unassigned,
          count(*) FILTER (WHERE completed_at IS NULL AND ${overdueClear}) AS ready,
          count(*) FILTER (WHERE completed_at>=now()-interval '7 days') AS completed_week
        FROM reconnection_records r`,
        [req.actor.id],
      ),
      pool.query(
        "SELECT e.id,e.kind,e.reason,e.created_at,s.account_no,u.name AS subscriber,x.name AS actor FROM service_events e JOIN service_accounts s ON s.id=e.service_id JOIN subscribers u ON u.id=s.subscriber_id LEFT JOIN users x ON x.id=e.actor_id ORDER BY e.created_at DESC,e.id DESC LIMIT 8",
      ),
      pool.query(
        `SELECT f.*,f.id AS service_id,r.id,r.requested_at,r.technician_id,t.name AS technician,${overdueClear} AS ready FROM reconnection_records r JOIN (${fieldService}) f ON f.id=r.service_id LEFT JOIN users t ON t.id=r.technician_id WHERE r.completed_at IS NULL AND (r.technician_id IS NULL OR r.technician_id=$1) ORDER BY r.requested_at LIMIT 8`,
        [req.actor.id],
      ),
      pool.query(
        `SELECT count(DISTINCT s.id) AS candidates FROM service_accounts s JOIN invoice_balances i ON i.service_id=s.id WHERE s.status='ACTIVE' AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT') AND CURRENT_DATE-i.due_date>=COALESCE((SELECT (value->>'suspensionDays')::int FROM application_settings WHERE key='service_policy'),60)+COALESCE((SELECT (value->>'graceDays')::int FROM application_settings WHERE key='service_policy'),7)`,
      ),
    ]);
    return {
      ...status.rows[0],
      reconnections: recon.rows[0],
      candidates: Number(candidates.rows[0].candidates),
      events: events.rows,
      queue: queue.rows,
    };
  });
  get("/field/services", "service.view", async (req: any) => {
    const q = z
      .object({
        search: z.string().trim().max(100).default(""),
        status: z.enum(["", "ACTIVE", "SUSPENDED", "TERMINATED"]).default(""),
        page: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    return (
      await pool.query(
        `SELECT f.*,(SELECT e.kind||' · '||to_char(e.created_at AT TIME ZONE 'Asia/Manila','YYYY-MM-DD') FROM service_events e WHERE e.service_id=f.id ORDER BY e.created_at DESC LIMIT 1) AS last_event
        FROM (${fieldService}) f
        WHERE ($1='' OR concat_ws(' ',f.account_no,f.subscriber,f.address,f.area,f.plan) ILIKE '%' || $1 || '%') AND ($2='' OR f.status=$2)
        ORDER BY f.subscriber,f.account_no LIMIT 50 OFFSET $3`,
        [q.search, q.status, (q.page - 1) * 50],
      )
    ).rows;
  });
  get("/field/suspensions", "service.view", async () => {
    const policy = `COALESCE((SELECT (value->>'suspensionDays')::int FROM application_settings WHERE key='service_policy'),60)+COALESCE((SELECT (value->>'graceDays')::int FROM application_settings WHERE key='service_policy'),7)`;
    const [candidates, suspended] = await Promise.all([
      pool.query(
        `SELECT f.*,min(i.due_date) AS oldest_due,CURRENT_DATE-min(i.due_date) AS days_overdue FROM (${fieldService}) f JOIN invoice_balances i ON i.service_id=f.id WHERE f.status='ACTIVE' AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT') AND CURRENT_DATE-i.due_date>=${policy} GROUP BY f.id,f.account_no,f.status,f.address,f.activation_date,f.plan,f.plan_type,f.subscriber_id,f.subscriber,f.contact,f.area ORDER BY min(i.due_date) LIMIT 100`,
      ),
      pool.query(
        `SELECT f.*,x.effective_date,x.reason,x.approver,CURRENT_DATE-x.effective_date AS days_suspended,
          EXISTS(SELECT 1 FROM reconnection_records r WHERE r.service_id=f.id AND r.completed_at IS NULL) AS reconnection_requested
        FROM (${fieldService}) f
        LEFT JOIN LATERAL (SELECT sr.effective_date,sr.reason,u.name AS approver FROM suspension_records sr LEFT JOIN users u ON u.id=sr.approved_by WHERE sr.service_id=f.id ORDER BY sr.id DESC LIMIT 1) x ON true
        WHERE f.status='SUSPENDED' ORDER BY x.effective_date NULLS LAST,f.subscriber LIMIT 100`,
      ),
    ]);
    return { candidates: candidates.rows, suspended: suspended.rows };
  });
  get("/field/reconnections", "service.view", async (req: any) => {
    const q = z
      .object({ view: z.enum(["pending", "completed"]).default("pending") })
      .parse(req.query);
    return (
      await pool.query(
        `SELECT f.*,f.id AS service_id,r.id,r.requested_at,r.completed_at,r.technician_id,t.name AS technician,${overdueClear} AS ready
        FROM reconnection_records r JOIN (${fieldService}) f ON f.id=r.service_id LEFT JOIN users t ON t.id=r.technician_id
        WHERE ${q.view === "pending" ? "r.completed_at IS NULL" : "r.completed_at IS NOT NULL"}
        ORDER BY ${q.view === "pending" ? "(r.technician_id=$1) DESC NULLS LAST,r.requested_at" : "r.completed_at DESC"} LIMIT 100`,
        q.view === "pending" ? [req.actor.id] : [],
      )
    ).rows;
  });
}

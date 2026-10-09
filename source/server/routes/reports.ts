import { z } from "zod";
import { pool } from "../db.js";
import { exportReport } from "../services/reports.js";
import { securityEvent } from "../services/security-audit.js";
import { id } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerReportRoutes({ get }: RouteContext) {
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
  get("/reports/:type", "", async (req: any, reply: any) => {
    const has = (p: string) =>
      req.actor.permissions.includes("*") || req.actor.permissions.includes(p);
    if (
      !has("report.export") &&
      !(
        ["collections", "collectors"].includes(req.params.type) &&
        has("collection.view")
      ) &&
      !(req.params.type === "soa" && has("ledger.view"))
    ) {
      await securityEvent(req, "auth.access_denied", "DENIED", req.actor.id, {
        permission: "report.export",
        method: req.method,
        path: req.routeOptions.url,
      });
      return reply
        .code(403)
        .send({ error: "Your role does not permit this action." });
    }
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
}

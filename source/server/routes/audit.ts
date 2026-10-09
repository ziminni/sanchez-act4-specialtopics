import { z } from "zod";
import { pool } from "../db.js";
import { manilaDate, manilaDateWindow } from "../../shared/domain.js";
import type { RouteContext } from "../http/route-context.js";

const corrections = `SELECT * FROM (
  SELECT 'REVERSAL' AS kind,r.id,r.created_at,p.id AS record_id,p.receipt_no AS reference,s.id AS subscriber_id,s.name AS subscriber,s.account_no,p.amount,r.reason,u.name AS actor,p.method AS detail
  FROM payment_reversals r JOIN payments p ON p.id=r.payment_id JOIN subscribers s ON s.id=p.subscriber_id LEFT JOIN users u ON u.id=r.actor_id
  UNION ALL
  SELECT CASE WHEN a.reason LIKE 'VOID: %' THEN 'VOID' ELSE 'ADJUSTMENT' END,a.id,a.created_at,i.id,i.number,s.id,s.name,s.account_no,a.amount,
    CASE WHEN a.reason LIKE 'VOID: %' THEN substr(a.reason,7) ELSE a.reason END,u.name,to_char(i.period,'YYYY-MM')
  FROM adjustments a JOIN invoices i ON i.id=a.invoice_id JOIN service_accounts sa ON sa.id=i.service_id JOIN subscribers s ON s.id=sa.subscriber_id LEFT JOIN users u ON u.id=a.actor_id
) c`;

export function registerAuditRoutes({ get }: RouteContext) {
  get("/audit/overview", "audit.view", async () => {
    const today = manilaDate(new Date());
    const monthStart = new Date(
      manilaDateWindow(today.slice(0, 8) + "01", today).start,
    );
    const [summary, recent, actors, receivables, events] = await Promise.all([
      pool.query(
        `SELECT count(*) FILTER (WHERE kind='REVERSAL') AS reversals,COALESCE(sum(amount) FILTER (WHERE kind='REVERSAL'),0) AS reversed_amount,
          count(*) FILTER (WHERE kind='ADJUSTMENT') AS adjustments,COALESCE(sum(amount) FILTER (WHERE kind='ADJUSTMENT' AND amount<0),0) AS credits,COALESCE(sum(amount) FILTER (WHERE kind='ADJUSTMENT' AND amount>0),0) AS debits,
          count(*) FILTER (WHERE kind='VOID') AS voids,COALESCE(sum(amount) FILTER (WHERE kind='VOID'),0) AS voided_amount
        FROM (${corrections}) x WHERE created_at>=$1`,
        [monthStart],
      ),
      pool.query(`${corrections} ORDER BY created_at DESC,id DESC LIMIT 8`),
      pool.query(
        `SELECT COALESCE(actor,'Unknown user') AS actor,count(*) AS corrections FROM (${corrections}) x WHERE created_at>=$1 GROUP BY actor ORDER BY count(*) DESC LIMIT 6`,
        [monthStart],
      ),
      pool.query(
        `SELECT COALESCE(sum(balance),0) AS total,count(DISTINCT subscriber_id) AS accounts,
          COALESCE(sum(balance) FILTER (WHERE due_date>=CURRENT_DATE),0) AS current,
          COALESCE(sum(balance) FILTER (WHERE CURRENT_DATE-due_date BETWEEN 1 AND 30),0) AS d30,
          COALESCE(sum(balance) FILTER (WHERE CURRENT_DATE-due_date BETWEEN 31 AND 60),0) AS d60,
          COALESCE(sum(balance) FILTER (WHERE CURRENT_DATE-due_date BETWEEN 61 AND 90),0) AS d90,
          COALESCE(sum(balance) FILTER (WHERE CURRENT_DATE-due_date>90),0) AS over90
        FROM invoice_balances WHERE balance>0 AND status NOT IN ('VOID','DRAFT')`,
      ),
      pool.query(
        "SELECT count(*) AS events,count(*) FILTER (WHERE action IN ('payment.reverse','invoice.adjust','invoice.void')) AS corrections FROM audit_logs WHERE created_at>now()-interval '7 days'",
      ),
    ]);
    return {
      month: today.slice(0, 7),
      summary: summary.rows[0],
      recent: recent.rows,
      actors: actors.rows,
      receivables: receivables.rows[0],
      events: events.rows[0],
    };
  });
  get("/corrections", "audit.view", async (req: any) => {
    const today = manilaDate(new Date());
    const q = z
      .object({
        kind: z.enum(["", "REVERSAL", "ADJUSTMENT", "VOID"]).default(""),
        search: z.string().trim().max(100).default(""),
        from: z.iso.date().default(today.slice(0, 8) + "01"),
        to: z.iso.date().default(today),
        page: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    if (q.from > q.to) throw new Error("Start date must not be after end date");
    const window = manilaDateWindow(q.from, q.to);
    const params = [new Date(window.start), new Date(window.end)];
    const [rows, summary] = await Promise.all([
      pool.query(
        `${corrections} WHERE created_at>=$1 AND created_at<$2 AND ($3='' OR kind=$3)
          AND ($4='' OR concat_ws(' ',reference,subscriber,account_no,reason,actor) ILIKE '%' || $4 || '%')
          ORDER BY created_at DESC,id DESC LIMIT 50 OFFSET $5`,
        [...params, q.kind, q.search, (q.page - 1) * 50],
      ),
      pool.query(
        `SELECT kind,count(*) AS count,COALESCE(sum(amount),0) AS amount FROM (${corrections}) x WHERE created_at>=$1 AND created_at<$2 GROUP BY kind`,
        params,
      ),
    ]);
    return { ...q, rows: rows.rows, summary: summary.rows };
  });
  get("/corrections/lookup", "payment.reverse", async (req: any) => {
    const q = z
      .object({ search: z.string().trim().min(2).max(100) })
      .parse(req.query);
    const like = `%${q.search}%`;
    const [payments, invoices] = await Promise.all([
      pool.query(
        "SELECT p.id,p.receipt_no,p.amount,p.method,p.paid_at,p.reversed,s.name,s.account_no FROM payments p JOIN subscribers s ON s.id=p.subscriber_id WHERE p.receipt_no ILIKE $1 OR s.name ILIKE $1 OR s.account_no ILIKE $1 ORDER BY p.paid_at DESC,p.id DESC LIMIT 10",
        [like],
      ),
      pool.query(
        "SELECT b.id,b.number,b.period,b.due_date,b.status,b.total,b.adjusted,b.balance,s.name,s.account_no FROM invoice_balances b JOIN subscribers s ON s.id=b.subscriber_id WHERE b.number ILIKE $1 OR s.name ILIKE $1 OR s.account_no ILIKE $1 ORDER BY b.period DESC,b.id DESC LIMIT 10",
        [like],
      ),
    ]);
    return { payments: payments.rows, invoices: invoices.rows };
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
}

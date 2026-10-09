import { z } from "zod";
import { pool, transaction } from "../db.js";
import { ledger } from "../services/finance.js";
import { id } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerLedgerRoutes({ get }: RouteContext) {
  get("/ledger/subscribers", "ledger.view", async (req: any) => {
    const q = z
      .object({
        search: z.string().trim().max(100).default(""),
        page: z.coerce.number().int().positive().default(1),
      })
      .parse(req.query);
    return (
      await pool.query(
        `SELECT s.id,s.account_no,s.name,s.status,a.name AS area,c.name AS collector,
          COALESCE((SELECT sum(i.balance) FROM invoice_balances i WHERE i.subscriber_id=s.id AND i.balance>0 AND i.status NOT IN ('VOID','DRAFT')),0) AS outstanding
        FROM subscribers s LEFT JOIN collection_areas a ON a.id=s.area_id LEFT JOIN collectors c ON c.id=s.collector_id
        WHERE $1='' OR s.name ILIKE '%' || $1 || '%' OR s.account_no ILIKE '%' || $1 || '%'
        ORDER BY s.name,s.id LIMIT 25 OFFSET $2`,
        [q.search, (q.page - 1) * 25],
      )
    ).rows;
  });
  get("/ledger/:id", "ledger.view", async (req: any) =>
    transaction(async (db) => {
      const n = id.parse(req.params.id);
      const subscriber = (
        await db.query(
          "SELECT s.id,s.account_no,s.name,s.address,s.contact,s.status,a.name AS area,c.name AS collector FROM subscribers s LEFT JOIN collection_areas a ON a.id=s.area_id LEFT JOIN collectors c ON c.id=s.collector_id WHERE s.id=$1",
          [n],
        )
      ).rows[0];
      if (!subscriber) throw new Error("Subscriber not found");
      const rows = await ledger(db, n);
      return {
        subscriber,
        rows,
        debits: rows.reduce((a, r) => a + Number(r.debit), 0),
        credits: rows.reduce((a, r) => a + Number(r.credit), 0),
        balance: rows.at(-1)?.balance ?? 0,
      };
    }),
  );
}

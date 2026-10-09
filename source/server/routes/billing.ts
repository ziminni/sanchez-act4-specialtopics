import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import {
  generateBilling,
  lockSubscriber,
  applyCredit,
} from "../services/finance.js";
import { id, reason } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerBillingRoutes({ get, post }: RouteContext) {
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
}

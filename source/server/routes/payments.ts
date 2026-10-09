import { z } from "zod";
import { pool, transaction } from "../db.js";
import { postPayment, reversePayment } from "../services/finance.js";
import { id, amount, reason } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

const paymentSchema = z.object({
  subscriberId: id,
  amount,
  method: z.enum(["Cash", "GCash", "Bank Transfer", "Cheque", "Other"]),
  reference: z.string().trim().max(100).optional(),
  notes: z.string().max(1000).optional(),
  idempotencyKey: z.uuid(),
  batchId: id.optional(),
});

export function registerPaymentRoutes({ get, post }: RouteContext) {
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
}

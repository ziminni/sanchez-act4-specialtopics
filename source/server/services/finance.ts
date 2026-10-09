import { type DB, audit } from "../db.js";
import { allocate } from "../../shared/domain.js";
export async function lockSubscriber(db: DB, id: number) {
  if (
    !(await db.query("SELECT id FROM subscribers WHERE id=$1 FOR UPDATE", [id]))
      .rowCount
  )
    throw new Error("Subscriber not found");
}
export async function applyCredit(db: DB, subscriber: number) {
  const payments = (
    await db.query(
      `SELECT p.id,p.amount-COALESCE(sum(a.amount),0) AS available FROM payments p LEFT JOIN payment_allocations a ON a.payment_id=p.id WHERE p.subscriber_id=$1 AND NOT p.reversed GROUP BY p.id HAVING p.amount>COALESCE(sum(a.amount),0) ORDER BY p.paid_at,p.id`,
      [subscriber],
    )
  ).rows;
  for (const p of payments) {
    const invoices = (
      await db.query(
        "SELECT id,balance FROM invoice_balances WHERE subscriber_id=$1 AND status NOT IN ('VOID','DRAFT','CREDITED') AND balance>0 ORDER BY period,id",
        [subscriber],
      )
    ).rows.map((i) => ({ id: i.id, balance: Number(i.balance) }));
    for (const a of allocate(Number(p.available), invoices).allocations)
      await db.query(
        "INSERT INTO payment_allocations(payment_id,invoice_id,amount) VALUES($1,$2,$3) ON CONFLICT(payment_id,invoice_id) DO UPDATE SET amount=payment_allocations.amount+excluded.amount",
        [p.id, a.invoiceId, a.amount],
      );
  }
  await db.query(
    `UPDATE invoices i SET status=CASE WHEN b.balance=0 THEN 'PAID' WHEN b.balance<b.total+b.adjusted THEN 'PARTIALLY_PAID' WHEN b.due_date<CURRENT_DATE THEN 'OVERDUE' ELSE 'UNPAID' END FROM invoice_balances b WHERE b.id=i.id AND b.subscriber_id=$1 AND i.status NOT IN ('VOID','DRAFT','CREDITED')`,
    [subscriber],
  );
}
export async function generateBilling(db: DB, period: string, actor: number) {
  await db.query(
    "INSERT INTO billing_cycles(period,actor_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [period, actor],
  );
  const accounts = (
    await db.query(
      "SELECT * FROM service_accounts WHERE status='ACTIVE' AND billing_start<($1::date+interval '1 month') ORDER BY subscriber_id,id",
      [period],
    )
  ).rows;
  let count = 0;
  for (const s of accounts) {
    await lockSubscriber(db, s.subscriber_id);
    const inserted = await db.query(
      `INSERT INTO invoices(number,service_id,period,due_date,total) VALUES('INV-'||lpad(nextval('invoice_number')::text,8,'0'),$1,$2,$2::date+($3::int-1),$4) ON CONFLICT(service_id,period) DO NOTHING RETURNING id`,
      [s.id, period, s.due_day, s.rate],
    );
    if (inserted.rowCount) {
      count++;
      await db.query(
        "INSERT INTO invoice_items(invoice_id,description,amount) VALUES($1,$2,$3)",
        [
          inserted.rows[0].id,
          `Monthly subscription · ${period.slice(0, 7)}`,
          s.rate,
        ],
      );
      await applyCredit(db, s.subscriber_id);
    }
  }
  await audit(db, actor, "billing.generate", "billing_cycles", period, {
    count,
  });
  return { count };
}
export type PaymentInput = {
  subscriberId: number;
  amount: number;
  method: string;
  reference?: string;
  notes?: string;
  idempotencyKey: string;
  batchId?: number;
  proofId?: number;
};
export async function postPayment(db: DB, p: PaymentInput, actor: number) {
  await lockSubscriber(db, p.subscriberId);
  const existing = (
    await db.query("SELECT * FROM payments WHERE idempotency_key=$1", [
      p.idempotencyKey,
    ])
  ).rows[0];
  if (existing) {
    if (
      existing.subscriber_id !== p.subscriberId ||
      Number(existing.amount) !== p.amount ||
      existing.method !== p.method ||
      existing.actor_id !== actor ||
      (existing.reference || "") !== (p.reference || "") ||
      (existing.batch_id || null) !== (p.batchId || null)
    )
      throw new Error("Idempotency key already used for a different payment");
    return existing;
  }
  if (p.method === "GCash") {
    const proof = (
      await db.query(
        "SELECT * FROM payment_proofs WHERE id=$1 AND status='VERIFIED' FOR UPDATE",
        [p.proofId],
      )
    ).rows[0];
    if (
      !proof ||
      proof.subscriber_id !== p.subscriberId ||
      Number(proof.amount) !== p.amount ||
      proof.reference !== p.reference
    )
      throw new Error("A matching verified GCash proof is required");
  }
  if (p.batchId) {
    const batch = (
      await db.query(
        "SELECT * FROM collection_batches WHERE id=$1 FOR UPDATE",
        [p.batchId],
      )
    ).rows[0];
    if (!batch || !["OPEN", "IN_PROGRESS"].includes(batch.status))
      throw new Error("Batch is not accepting collections");
    if (
      !(
        await db.query(
          "SELECT 1 FROM batch_accounts WHERE batch_id=$1 AND subscriber_id=$2",
          [p.batchId, p.subscriberId],
        )
      ).rowCount
    )
      throw new Error("Subscriber is not assigned to batch");
    await db.query(
      "UPDATE collection_batches SET status='IN_PROGRESS' WHERE id=$1",
      [p.batchId],
    );
  }
  const result = (
    await db.query(
      `INSERT INTO payments(subscriber_id,receipt_no,amount,method,reference,notes,idempotency_key,batch_id,actor_id,proof_id) VALUES($1,'RCPT-'||lpad(nextval('receipt_number')::text,8,'0'),$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        p.subscriberId,
        p.amount,
        p.method,
        p.reference || null,
        p.notes || "",
        p.idempotencyKey,
        p.batchId || null,
        actor,
        p.proofId || null,
      ],
    )
  ).rows[0];
  await applyCredit(db, p.subscriberId);
  await audit(db, actor, "payment.post", "payments", result.id, result);
  return result;
}
export async function reversePayment(
  db: DB,
  id: number,
  reason: string,
  actor: number,
) {
  const initial = (await db.query("SELECT * FROM payments WHERE id=$1", [id]))
    .rows[0];
  if (!initial) throw new Error("Payment not found");
  await lockSubscriber(db, initial.subscriber_id);
  const p = (
    await db.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (p.reversed) throw new Error("Payment already reversed");
  if (p.batch_id) {
    const b = (
      await db.query(
        "SELECT status FROM collection_batches WHERE id=$1 FOR UPDATE",
        [p.batch_id],
      )
    ).rows[0];
    if (!["OPEN", "IN_PROGRESS"].includes(b.status))
      throw new Error(
        "Submitted batch payments require separate accounting adjustment",
      );
  }
  await db.query("UPDATE payments SET reversed=true WHERE id=$1", [id]);
  await db.query(
    "INSERT INTO payment_reversals(payment_id,actor_id,reason) VALUES($1,$2,$3)",
    [id, actor, reason],
  );
  await applyCredit(db, p.subscriber_id);
  await audit(db, actor, "payment.reverse", "payments", id, p, reason);
  return { ok: true };
}
export async function ledger(db: DB, id: number) {
  return (
    await db.query(
      `SELECT * FROM (SELECT i.created_at AS date,i.number AS reference,'Subscription invoice' AS description,i.total AS debit,0::bigint AS credit FROM invoices i JOIN service_accounts s ON s.id=i.service_id WHERE s.subscriber_id=$1 AND i.status<>'DRAFT' UNION ALL SELECT p.paid_at,p.receipt_no,p.method||' payment',0,p.amount FROM payments p WHERE subscriber_id=$1 UNION ALL SELECT r.created_at,p.receipt_no||'/REV',r.reason,p.amount,0 FROM payment_reversals r JOIN payments p ON p.id=r.payment_id WHERE p.subscriber_id=$1 UNION ALL SELECT a.created_at,'ADJ-'||a.id,a.reason,greatest(a.amount,0),greatest(-a.amount,0) FROM adjustments a JOIN invoices i ON i.id=a.invoice_id JOIN service_accounts s ON s.id=i.service_id WHERE s.subscriber_id=$1) l ORDER BY date,reference`,
      [id],
    )
  ).rows.map(
    ((r) => {
      let balance = 0;
      return (row: any) => ({
        ...row,
        balance: (balance += Number(row.debit) - Number(row.credit)),
      });
    })(),
  );
}

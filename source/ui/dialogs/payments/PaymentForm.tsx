import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { allocate, centavos, money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Field } from "../../components/Field";
import { SubscriberPicker } from "../../components/SubscriberPicker";

export function PaymentForm({
  api,
  busy,
  submit,
  onDone,
}: {
  api: (p: string, b?: unknown) => Promise<any>;
  busy: boolean;
  submit: any;
  onDone: (r: Row) => Promise<void>;
}) {
  const [account, setAccount] = useState<Row | null>(null),
    [value, setValue] = useState(""),
    [key] = useState(crypto.randomUUID()),
    [selectedSubscriber, setSelectedSubscriber] = useState<Row | null>(null),
    [accountLoading, setAccountLoading] = useState(false),
    [accountError, setAccountError] = useState("");
  useEffect(() => {
    if (!selectedSubscriber) return;
    let cancelled = false;
    setAccountLoading(true);
    api("/subscribers/" + selectedSubscriber.id)
      .then((result) => {
        if (!cancelled) setAccount(result);
      })
      .catch((e) => {
        if (!cancelled) setAccountError(e.message);
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSubscriber, api]);
  let cents = 0;
  try {
    cents = centavos(value || "0");
  } catch {}
  const invoices =
    account?.invoices
      .filter(
        (r: Row) =>
          Number(r.balance) > 0 && !["VOID", "DRAFT"].includes(r.status),
      )
      .sort(
        (a: Row, b: Row) =>
          String(a.period).localeCompare(String(b.period)) || a.id - b.id,
      ) || [];
  const allocation = allocate(
    cents,
    invoices.map((r: Row) => ({ id: r.id, balance: Number(r.balance) })),
  );
  return (
    <form
      onSubmit={(e) =>
        submit(e, async (b: Row) => {
          if (!account || account.subscriber.id !== selectedSubscriber?.id)
            throw new Error("Select a subscriber from the search results");
          const r = await api("/payments", {
            subscriberId: account.subscriber.id,
            amount: centavos(b.amount),
            method: b.method,
            reference: b.reference,
            notes: b.notes,
            idempotencyKey: key,
            ...(b.batchId ? { batchId: Number(b.batchId) } : {}),
          });
          await onDone({ ...r, name: account.subscriber.name });
        })
      }
    >
      <div className="payment-grid">
        <div>
          <SubscriberPicker
            onSelect={(r) => {
              setAccount(null);
              setAccountError("");
              setAccountLoading(Boolean(r));
              setSelectedSubscriber(r);
            }}
          />
          {accountLoading && <p role="status">Loading subscriber balance…</p>}
          {accountError && (
            <div className="error" role="alert">
              {accountError}
            </div>
          )}
          <div className="form-grid">
            <Field label="Amount (PHP) *">
              <input
                name="amount"
                className="amount-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                required
                inputMode="decimal"
              />
            </Field>
            <Field label="Method *">
              <select name="method">
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Other</option>
              </select>
            </Field>
          </div>
          <Field label="Reference number">
            <input name="reference" />
          </Field>
          <Field label="Collection batch (optional)">
            <input
              name="batchId"
              type="number"
              min="1"
              placeholder="Batch ID for field collection"
            />
          </Field>
          <Field label="Notes">
            <textarea name="notes" />
          </Field>
        </div>
        <div className="allocation">
          <div className="eyebrow">ALLOCATION PREVIEW</div>
          <h3>Oldest balance first</h3>
          <p>Server revalidates balances when posting.</p>
          {allocation.allocations.map((a) => {
            const i = invoices.find((r: Row) => r.id === a.invoiceId);
            return (
              <div className="allocation-row" key={a.invoiceId}>
                <span>
                  {i.number}
                  <small>Due {date(i.due_date)}</small>
                </span>
                <strong>{money(a.amount)}</strong>
              </div>
            );
          })}
          <div className="allocation-row">
            <span>Advance credit</span>
            <strong>{money(allocation.credit)}</strong>
          </div>
          <p>
            Unused value is retained and automatically applied to future
            invoices.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <span>
          <ShieldCheck size={15} /> Transactional posting · Unique receipt
        </span>
        <button
          className="primary"
          disabled={
            busy ||
            !account ||
            account.subscriber.id !== selectedSubscriber?.id ||
            cents <= 0
          }
        >
          {busy ? "Posting…" : "Post payment & view receipt"}
        </button>
      </div>
    </form>
  );
}

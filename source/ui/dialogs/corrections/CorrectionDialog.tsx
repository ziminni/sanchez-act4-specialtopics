import { centavos } from "../../../shared/domain";
import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function CorrectionDialog() {
  const { busy, modal, selected, setSelected, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            if (modal === "void")
              await api(`/invoices/${selected!.id}/void`, b);
            else if (modal === "reverse")
              await api(`/payments/${selected!.id}/reverse`, b);
            else if (modal === "adjust")
              await api(`/invoices/${selected!.id}/adjust`, {
                reason: b.reason,
                amount:
                  (b.direction === "credit" ? -1 : 1) * centavos(b.amount),
              });
            else
              await api(`/proofs/${selected!.id}/review`, {
                decision: modal === "verify" ? "VERIFIED" : "REJECTED",
                reason: b.reason,
              });
            await done("Financial record updated and audit entry recorded.");
            setSelected(null);
          })
        }
      >
        <p>
          {modal === "void"
            ? "Voiding preserves the invoice and records an offsetting credit. Allocated payments must be reversed first."
            : modal === "reverse"
              ? "The original receipt remains visible. Its allocations will no longer reduce the invoice balances."
              : modal === "verify"
                ? "Confirm that this reference and amount match the business GCash transaction history. Verification posts the payment immediately."
                : modal === "adjust"
                  ? "Add a traceable debit or credit adjustment without changing the original invoice."
                  : "Record why this proof cannot be accepted."}
        </p>
        {modal === "adjust" && (
          <>
            <Field label="Adjustment">
              <select name="direction">
                <option value="credit">Credit / discount</option>
                <option value="debit">Debit / fee</option>
              </select>
            </Field>
            <Field label="Amount (PHP) *">
              <input name="amount" required inputMode="decimal" />
            </Field>
          </>
        )}
        <Field label="Reason *">
          <textarea name="reason" required minLength={5} />
        </Field>
        <button
          className={modal === "reverse" ? "danger" : "primary"}
          disabled={busy}
        >
          Confirm {modal}
        </button>
      </form>
    </>
  );
}

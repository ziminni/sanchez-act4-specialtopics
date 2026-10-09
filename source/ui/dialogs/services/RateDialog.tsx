import { centavos } from "../../../shared/domain";
import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function RateDialog() {
  const { busy, selected, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api(`/services/${selected!.id}/rate`, {
              rate: centavos(b.rate),
              reason: b.reason,
            });
            await done(
              "Future rate updated. Historical invoices are unchanged.",
            );
          })
        }
      >
        <Field label="New monthly rate (PHP) *">
          <input
            name="rate"
            required
            defaultValue={(Number(selected?.rate) / 100).toFixed(2)}
          />
        </Field>
        <Field label="Reason *">
          <textarea name="reason" minLength={5} required />
        </Field>
        <button className="primary" disabled={busy}>
          Update future rate
        </button>
      </form>
    </>
  );
}

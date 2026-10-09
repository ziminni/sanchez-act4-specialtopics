import { api } from "../../api/client";
import { today } from "../../lib/format";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function GenerateBillingDialog() {
  const { busy, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            const r = await api("/billing/generate", {
              period: b.period + "-01",
            });
            await done(
              `${r.count} invoices generated. Existing invoices were preserved.`,
            );
          })
        }
      >
        <p>
          Bill active service accounts at their current agreed rate. Subscriber
          credits are applied automatically. Re-running a period does not
          duplicate invoices.
        </p>
        <Field label="Billing month *">
          <input
            type="month"
            name="period"
            defaultValue={today().slice(0, 7)}
            required
          />
        </Field>
        <button className="primary" disabled={busy}>
          Generate invoices
        </button>
      </form>
    </>
  );
}

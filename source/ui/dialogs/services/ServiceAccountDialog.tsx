import { centavos, money } from "../../../shared/domain";
import { api } from "../../api/client";
import { today } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function ServiceAccountDialog() {
  const {
    busy,
    lookups,
    suggestedAccountNo,
    identifierToken,
    profile,
    submit,
    done,
  } = useApp();
  if (!profile) return null;
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api("/services", {
              ...b,
              identifierToken,
              subscriberId: profile.subscriber.id,
              planId: Number(b.planId),
              rate: centavos(b.rate),
              dueDay: Number(b.dueDay),
            });
            await done("Service account created.");
          })
        }
      >
        <Field label="Service account number *">
          <input
            name="accountNo"
            disabled
            className="generated-id"
            value={suggestedAccountNo}
          />
        </Field>
        <Field label="Plan *">
          <select name="planId">
            {lookups.plans.map((r: Row) => (
              <option key={r.id} value={r.id}>
                {r.name} · {money(r.price)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Agreed monthly rate (PHP) *">
          <input name="rate" required inputMode="decimal" />
        </Field>
        <Field label="Installation address *">
          <input
            name="address"
            defaultValue={profile.subscriber.address}
            required
          />
        </Field>
        <div className="form-grid">
          <Field label="Activation date *">
            <input
              type="date"
              name="activationDate"
              defaultValue={today()}
              required
            />
          </Field>
          <Field label="Billing start *">
            <input
              type="date"
              name="billingStart"
              defaultValue={today()}
              required
            />
          </Field>
        </div>
        <Field label="Due day *">
          <input
            type="number"
            min="1"
            max="28"
            name="dueDay"
            defaultValue={profile.subscriber.due_day}
            required
          />
        </Field>
        <button className="primary" disabled={busy}>
          Create service account
        </button>
      </form>
    </>
  );
}

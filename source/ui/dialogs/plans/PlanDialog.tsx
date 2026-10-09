import { centavos } from "../../../shared/domain";
import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function PlanDialog() {
  const { busy, suggestedAccountNo, identifierToken, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api("/plans", {
              ...b,
              identifierToken,
              price: centavos(b.price),
            });
            await done("Service plan created.");
          })
        }
      >
        <Field label="Code *">
          <input
            name="code"
            disabled
            className="generated-id"
            value={suggestedAccountNo}
          />
        </Field>
        <Field label="Plan name *">
          <input name="name" required />
        </Field>
        <Field label="Service type">
          <select name="type">
            <option>Internet</option>
            <option>Cable</option>
            <option>Combo</option>
          </select>
        </Field>
        <Field label="Monthly price (PHP) *">
          <input name="price" inputMode="decimal" required />
        </Field>
        <button className="primary" disabled={busy}>
          Create plan
        </button>
      </form>
    </>
  );
}

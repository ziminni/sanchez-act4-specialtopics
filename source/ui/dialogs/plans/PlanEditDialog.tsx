import { centavos } from "../../../shared/domain";
import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function PlanEditDialog() {
  const { busy, selected, submit, done } = useApp();
  if (!selected) return null;
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api(`/plans/${selected.id}/edit`, {
              ...b,
              price: centavos(b.price),
              fee: centavos(b.fee),
              speed: b.speed ? Number(b.speed) : null,
              channels: b.channels ? Number(b.channels) : null,
              active: b.active === "true",
            });
            await done(
              "Plan updated. Existing service rates and invoices are preserved.",
            );
          })
        }
      >
        <div className="form-grid">
          <Field label="Code *">
            <input
              name="code"
              disabled
              className="generated-id"
              defaultValue={selected.code}
            />
          </Field>
          <Field label="Name *">
            <input name="name" required defaultValue={selected.name} />
          </Field>
          <Field label="Type">
            <select name="type" defaultValue={selected.type}>
              <option>Internet</option>
              <option>Cable</option>
              <option>Combo</option>
            </select>
          </Field>
          <Field label="Price (PHP) *">
            <input
              name="price"
              required
              defaultValue={(Number(selected.price) / 100).toFixed(2)}
            />
          </Field>
          <Field label="Standard fee (PHP)">
            <input
              name="fee"
              required
              defaultValue={(Number(selected.fee) / 100).toFixed(2)}
            />
          </Field>
          <Field label="Speed (Mbps)">
            <input
              name="speed"
              type="number"
              min="0"
              defaultValue={selected.speed ?? ""}
            />
          </Field>
          <Field label="Channel count">
            <input
              name="channels"
              type="number"
              min="0"
              defaultValue={selected.channels ?? ""}
            />
          </Field>
          <Field label="Availability">
            <select name="active" defaultValue={String(selected.active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </Field>
        </div>
        <Field label="Description">
          <textarea name="description" defaultValue={selected.description} />
        </Field>
        <button className="primary" disabled={busy}>
          Save plan
        </button>
      </form>
    </>
  );
}

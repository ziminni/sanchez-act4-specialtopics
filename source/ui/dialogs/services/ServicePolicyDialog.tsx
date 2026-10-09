import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function ServicePolicyDialog() {
  const { busy, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api("/settings", {
              graceDays: Number(b.graceDays),
              suspensionDays: Number(b.suspensionDays),
            });
            await done("Service policy saved.");
          })
        }
      >
        <Field label="Grace period (days)">
          <input
            type="number"
            name="graceDays"
            min="0"
            max="90"
            defaultValue="7"
            required
          />
        </Field>
        <Field label="Suspension threshold (days overdue)">
          <input
            type="number"
            name="suspensionDays"
            min="1"
            max="365"
            defaultValue="60"
            required
          />
        </Field>
        <button className="primary" disabled={busy}>
          Save policy
        </button>
      </form>
    </>
  );
}

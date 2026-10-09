import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function ServiceStateDialog() {
  const { busy, selected, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            const r = await api(`/services/${selected!.id}/state`, b);
            await done(r.message || "Service status updated.");
          })
        }
      >
        <Field label="New status">
          <select name="status">
            <option value="SUSPENDED">Suspend</option>
            <option value="ACTIVE">Request reconnection</option>
            <option value="TERMINATED">Terminate</option>
          </select>
        </Field>
        <Field label="Reason *">
          <textarea name="reason" required minLength={5} />
        </Field>
        <button className="primary" disabled={busy}>
          Record service change
        </button>
      </form>
    </>
  );
}

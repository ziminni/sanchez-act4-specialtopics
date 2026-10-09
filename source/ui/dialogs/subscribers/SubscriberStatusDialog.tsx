import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function SubscriberStatusDialog() {
  const { busy, profile, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api(`/subscribers/${profile!.subscriber.id}/status`, b);
            await done(
              "Subscriber status updated. Financial history is preserved.",
            );
          })
        }
      >
        <Field label="Status">
          <select name="status">
            {["ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Field>
        <Field label="Reason *">
          <textarea name="reason" required minLength={5} />
        </Field>
        <button className="primary" disabled={busy}>
          Save status
        </button>
      </form>
    </>
  );
}

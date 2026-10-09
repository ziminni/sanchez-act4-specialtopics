import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function UserDialog() {
  const { busy, systemAdmin, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api("/users", b);
            await done("Team member added.");
          })
        }
      >
        <Field label="Full name *">
          <input name="name" required />
        </Field>
        <Field label="Username *">
          <input name="username" required autoComplete="off" />
        </Field>
        <Field label="Password (12+ characters) *">
          <input
            type="password"
            name="password"
            required
            minLength={12}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Role *">
          <select name="role">
            {[
              "Administrator",
              "Cashier",
              "Collection Supervisor",
              "Auditor",
              "Technician",
              "Viewer",
              "Owner",
            ]
              .filter((r) => !systemAdmin || r !== "Owner")
              .map((r) => (
                <option key={r}>{r}</option>
              ))}
          </select>
        </Field>
        <button className="primary" disabled={busy}>
          Create user
        </button>
      </form>
    </>
  );
}

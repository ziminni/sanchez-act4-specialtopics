import { api } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function AreaCollectorDialog() {
  const { busy, modal, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api(modal === "area" ? "/areas" : "/collectors", b);
            await done("Record created.");
          })
        }
      >
        <Field label="Name *">
          <input name="name" required />
        </Field>
        <button className="primary" disabled={busy}>
          Create
        </button>
      </form>
    </>
  );
}

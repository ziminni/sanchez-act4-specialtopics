import { api } from "../../api/client";
import type { Row } from "../../lib/types";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function BatchDialog() {
  const { busy, lookups, submit, done } = useApp();
  return (
    <>
      <form
        onSubmit={(e) =>
          submit(e, async (b) => {
            await api("/batches", {
              collectorId: Number(b.collectorId),
              areaId: Number(b.areaId),
            });
            await done(
              "Collection batch created with assigned subscriber balances.",
            );
          })
        }
      >
        <Field label="Collector *">
          <select name="collectorId">
            {lookups.collectors.map((r: Row) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Area / route *">
          <select name="areaId">
            {lookups.areas.map((r: Row) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
        <button className="primary" disabled={busy}>
          Create batch
        </button>
      </form>
    </>
  );
}

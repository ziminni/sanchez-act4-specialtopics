import { Printer } from "lucide-react";
import { centavos, money } from "../../../shared/domain";
import { api } from "../../api/client";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function ReconcileDialog() {
  const { busy, selected, setSelected, can, run, submit, done } = useApp();
  if (!selected) return null;
  return (
    <>
      <>
        <div className="collection-kpis">
          <div className="mini-stat">
            Expected cash<strong>{money(selected.cash)}</strong>
          </div>
          <div className="mini-stat">
            Remitted cash
            <strong>{money(selected.remitted_cash || 0)}</strong>
          </div>
          <div className="mini-stat">
            Difference
            <strong
              className={Number(selected.difference) < 0 ? "red-text" : ""}
            >
              {selected.difference === null
                ? "Not remitted"
                : money(selected.difference)}
            </strong>
          </div>
        </div>
        <p>
          Collector: <strong>{selected.collector}</strong> · Area:{" "}
          {selected.area} · <Badge value={selected.status} />
        </p>
        <p>
          Non-cash collections: <strong>{money(selected.noncash)}</strong>.
          Shortages and overages remain recorded when a batch is closed.
        </p>
        <button
          onClick={() =>
            run(async () => {
              const route = await api(`/batches/${selected.id}/route`);
              setSelected({ ...selected, route });
            })
          }
        >
          Show printable route sheet
        </button>
        {selected.route && (
          <div className="printable">
            <h3>Route sheet · {selected.collector}</h3>
            <Table
              rows={selected.route}
              columns={[
                ["account_no", "Account"],
                ["name", "Subscriber"],
                ["address", "Address"],
                ["expected", "Expected", (r) => money(r.expected)],
              ]}
            />
            <button className="no-print" onClick={() => window.print()}>
              <Printer size={15} /> Print route
            </button>
          </div>
        )}
        {can("collection.reconcile") && selected.status !== "CLOSED" && (
          <form
            onSubmit={(e) =>
              submit(e, async (b) => {
                if (selected.status === "SUBMITTED")
                  await api(`/batches/${selected.id}/remit`, {
                    amount: centavos(b.amount),
                    reason: b.reason,
                  });
                else
                  await api(`/batches/${selected.id}/transition`, {
                    status: ["OPEN", "IN_PROGRESS"].includes(selected.status)
                      ? "SUBMITTED"
                      : selected.status === "REMITTED"
                        ? "RECONCILED"
                        : "CLOSED",
                    reason: b.reason,
                  });
                await done(
                  "Batch updated. Remittance differences remain in the audit history.",
                );
              })
            }
          >
            {selected.status === "SUBMITTED" && (
              <Field label="Cash remitted (PHP) *">
                <input name="amount" inputMode="decimal" required />
              </Field>
            )}
            <Field label="Confirmation / exception reason *">
              <textarea name="reason" required minLength={5} />
            </Field>
            <button className="primary" disabled={busy}>
              {["OPEN", "IN_PROGRESS"].includes(selected.status)
                ? "Submit batch"
                : selected.status === "SUBMITTED"
                  ? "Record remittance"
                  : selected.status === "REMITTED"
                    ? "Confirm reconciliation"
                    : "Approve and close batch"}
            </button>
          </form>
        )}
      </>
    </>
  );
}

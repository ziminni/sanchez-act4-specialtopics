import { ChevronRight, Plus } from "lucide-react";
import { money } from "../../../shared/domain";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function BatchesPage() {
  const { setModal, setSelected, can, rows } = useApp();
  return (
    <>
      <>
        <div className="collection-kpis">
          <div className="mini-stat">
            Open batches
            <strong>
              {rows.filter((r: Row) => r.status !== "CLOSED").length}
            </strong>
          </div>
          <div className="mini-stat">
            Cash collected
            <strong>
              {money(rows.reduce((a: number, r: Row) => a + Number(r.cash), 0))}
            </strong>
          </div>
          <div className="mini-stat">
            Non-cash collected
            <strong>
              {money(
                rows.reduce((a: number, r: Row) => a + Number(r.noncash), 0),
              )}
            </strong>
          </div>
          <div className="mini-stat">
            Remittance difference
            <strong>
              {money(
                rows.reduce(
                  (a: number, r: Row) => a + Number(r.difference || 0),
                  0,
                ),
              )}
            </strong>
          </div>
        </div>
        <section className="panel">
          <Table
            rows={rows}
            columns={[
              ["id", "Batch", (r) => `BATCH-${String(r.id).padStart(4, "0")}`],
              ["collector", "Collector"],
              ["area", "Area"],
              ["status", "Status", (r) => <Badge value={r.status} />],
              ["expected", "Expected", (r) => money(r.expected)],
              ["cash", "Cash", (r) => money(r.cash)],
              ["noncash", "Non-cash", (r) => money(r.noncash)],
              [
                "difference",
                "Difference",
                (r) =>
                  r.difference === null ? (
                    "—"
                  ) : (
                    <span
                      className={Number(r.difference) < 0 ? "red-text" : ""}
                    >
                      {money(r.difference)}
                    </span>
                  ),
              ],
              [
                "actions",
                "",
                (r) => (
                  <button
                    onClick={() => {
                      setSelected(r);
                      setModal("reconcile");
                    }}
                  >
                    Open batch <ChevronRight size={13} />
                  </button>
                ),
              ],
            ]}
          />
        </section>
        <div className="actions pad">
          {can("collection.manage") && (
            <>
              <button onClick={() => setModal("collector")}>
                Add collector
              </button>
              <button onClick={() => setModal("area")}>Add area / route</button>
            </>
          )}
        </div>
      </>
    </>
  );
}

export function BatchesActions() {
  const { setModal, can } = useApp();
  return (
    <>
      {can("collection.manage") && (
        <button className="primary" onClick={() => setModal("batch")}>
          <Plus size={17} /> New batch
        </button>
      )}
    </>
  );
}

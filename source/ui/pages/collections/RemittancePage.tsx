import { ArrowUpRight } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";
import { Variance, batchNo, nextStep } from "./shared";

export function Remittances({
  data,
  openBatch,
}: {
  data: Row;
  openBatch: (batch: Row) => void;
}) {
  const count = (s: string[]) =>
    data.queue.filter((b: Row) => s.includes(b.status)).length;
  const submittedCash = data.queue
    .filter((b: Row) => b.status === "SUBMITTED")
    .reduce((a: number, b: Row) => a + Number(b.cash), 0);
  const net = data.history.reduce(
    (a: number, r: Row) => a + Number(r.difference),
    0,
  );
  return (
    <div className="admin-dashboard">
      <div className="admin-stat-grid">
        {[
          [
            "In the field",
            count(["OPEN", "IN_PROGRESS"]),
            "Open batches not yet submitted",
          ],
          [
            "Awaiting remittance",
            count(["SUBMITTED"]),
            `${money(submittedCash)} cash expected from collectors`,
          ],
          [
            "Awaiting reconciliation",
            count(["REMITTED"]),
            "Remitted · confirm against collections",
          ],
          [
            "Ready to close",
            count(["RECONCILED"]),
            "Reconciled · approve to close",
          ],
        ].map(([label, value, detail]) => (
          <div className="panel admin-stat" key={label as string}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Reconciliation queue</h2>
            <p>
              Submit → record remittance → confirm reconciliation → approve and
              close. Each step needs a reason and is audited.
            </p>
          </div>
        </div>
        <Table
          rows={data.queue}
          columns={[
            ["id", "Batch", (r) => batchNo(r.id)],
            ["collector", "Collector"],
            ["area", "Area"],
            ["status", "Status", (r) => <Badge value={r.status} />],
            ["expected", "Expected", (r) => money(r.expected)],
            ["cash", "Cash collected", (r) => money(r.cash)],
            ["noncash", "Non-cash", (r) => money(r.noncash)],
            [
              "actions",
              "",
              (r) => (
                <button onClick={() => openBatch(r)}>
                  {nextStep[r.status]} <ArrowUpRight size={13} />
                </button>
              ),
            ],
          ]}
        />
      </section>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Remittance history</h2>
            <p>
              Latest {data.history.length} remittances · net difference{" "}
              <Variance value={net} />
            </p>
          </div>
        </div>
        <Table
          rows={data.history}
          columns={[
            ["created_at", "Remitted", (r) => date(r.created_at)],
            ["batch_id", "Batch", (r) => batchNo(r.batch_id)],
            ["collector", "Collector"],
            ["area", "Area"],
            ["expected_cash", "Expected cash", (r) => money(r.expected_cash)],
            ["remitted_cash", "Remitted cash", (r) => money(r.remitted_cash)],
            [
              "difference",
              "Difference",
              (r) => <Variance value={r.difference} />,
            ],
            ["status", "Batch status", (r) => <Badge value={r.status} />],
            ["actor", "Recorded by"],
            ["notes", "Reason"],
          ]}
        />
      </section>
    </div>
  );
}

export function RemittancePage() {
  const { data, setModal, setSelected } = useApp();
  return (
    <>
      <Remittances
        data={data}
        openBatch={(b) => {
          setSelected(b);
          setModal("reconcile");
        }}
      />
    </>
  );
}

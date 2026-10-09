import { serviceColumns } from "./shared";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function Suspensions({ data }: { data: Row }) {
  return (
    <div className="admin-dashboard">
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Suspended services</h2>
            <p>
              {data.suspended.length} disconnected · latest suspension record
              for each
            </p>
          </div>
        </div>
        <Table
          rows={data.suspended}
          columns={[
            ...serviceColumns,
            ["effective_date", "Suspended on", (r) => date(r.effective_date)],
            [
              "days_suspended",
              "Days",
              (r) => (r.days_suspended === null ? "—" : r.days_suspended),
            ],
            [
              "reason",
              "Reason",
              (r) => <span className="audit-reason">{r.reason || "—"}</span>,
            ],
            ["approver", "Approved by", (r) => r.approver || "—"],
            [
              "reconnection_requested",
              "Reconnection",
              (r) =>
                r.reconnection_requested ? <Badge value="REQUESTED" /> : "—",
            ],
          ]}
        />
      </section>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Due for suspension</h2>
            <p>
              Active services past the overdue policy. Suspension is approved by
              the office; this list is for field planning.
            </p>
          </div>
        </div>
        <Table
          rows={data.candidates}
          columns={[
            ...serviceColumns,
            ["oldest_due", "Oldest unpaid due date", (r) => date(r.oldest_due)],
            ["days_overdue", "Days overdue"],
          ]}
        />
      </section>
    </div>
  );
}

export function SuspensionsPage() {
  const { data } = useApp();
  return (
    <>
      <Suspensions data={data} />
    </>
  );
}

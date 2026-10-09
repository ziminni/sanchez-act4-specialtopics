import { Plus } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { ListPanel } from "../../components/ListPanel";
import { useApp } from "../../app/AppContext";

export function BillingPage() {
  const { setModal, setSelected, can, rows } = useApp();
  return (
    <>
      <ListPanel search="Search invoices or subscriber…">
        <Table
          rows={rows}
          columns={[
            [
              "number",
              "Invoice",
              (r) => <span className="mono blue-text">{r.number}</span>,
            ],
            ["name", "Subscriber"],
            ["period", "Billing period", (r) => date(r.period)],
            ["due_date", "Due date", (r) => date(r.due_date)],
            [
              "status",
              "Status",
              (r) => (
                <Badge
                  value={
                    Number(r.balance) > 0 && new Date(r.due_date) < new Date()
                      ? "OVERDUE"
                      : r.status
                  }
                />
              ),
            ],
            ["total", "Billed", (r) => money(r.total)],
            ["balance", "Balance", (r) => money(r.balance)],
            [
              "action",
              "",
              (r) =>
                can("payment.reverse") ? (
                  <div className="actions">
                    <button
                      onClick={() => {
                        setSelected(r);
                        setModal("adjust");
                      }}
                    >
                      Adjust
                    </button>
                    <button
                      disabled={r.status === "VOID"}
                      onClick={() => {
                        setSelected(r);
                        setModal("void");
                      }}
                    >
                      Void
                    </button>
                  </div>
                ) : null,
            ],
          ]}
        />
      </ListPanel>
    </>
  );
}

export function BillingActions() {
  const { setModal, can } = useApp();
  return (
    <>
      {can("billing.generate") && (
        <button className="primary" onClick={() => setModal("billing")}>
          <Plus size={17} /> Generate billing
        </button>
      )}
    </>
  );
}

import { Plus, Printer } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { ListPanel } from "../../components/ListPanel";
import { useApp } from "../../app/AppContext";

export function PaymentsPage() {
  const { setModal, setSelected, can, rows } = useApp();
  return (
    <>
      <ListPanel>
        <Table
          rows={rows}
          columns={[
            [
              "receipt_no",
              "Receipt",
              (r) => <span className="mono blue-text">{r.receipt_no}</span>,
            ],
            ["name", "Subscriber"],
            ["paid_at", "Paid on", (r) => date(r.paid_at)],
            ["method", "Method", (r) => <Badge value={r.method} />],
            ["amount", "Amount", (r) => money(r.amount)],
            [
              "reversed",
              "Status",
              (r) => <Badge value={r.reversed ? "REVERSED" : "POSTED"} />,
            ],
            [
              "action",
              "",
              (r) => (
                <div className="actions">
                  <button
                    onClick={() => {
                      setSelected(r);
                      setModal("receipt");
                    }}
                  >
                    <Printer size={14} />
                  </button>
                  {can("payment.reverse") && !r.reversed && (
                    <button
                      onClick={() => {
                        setSelected(r);
                        setModal("reverse");
                      }}
                    >
                      Reverse
                    </button>
                  )}
                </div>
              ),
            ],
          ]}
        />
      </ListPanel>
    </>
  );
}

export function PaymentsActions() {
  const { setModal, can } = useApp();
  return (
    <>
      {can("payment.create") && (
        <>
          <button onClick={() => setModal("proof")}>Record GCash proof</button>
          <button className="primary" onClick={() => setModal("payment")}>
            <Plus size={17} /> Receive payment
          </button>
        </>
      )}
    </>
  );
}

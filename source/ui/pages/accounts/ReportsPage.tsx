import { Download, FileText } from "lucide-react";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function ReportsPage() {
  const { busy, from, setFrom, to, setTo, can, download } = useApp();
  return (
    <>
      <>
        <div className="report-filter">
          <Field label="From">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
          <p>
            Export live financial records for your selected period.
            <br />
            Aging reflects balances as of today.
          </p>
        </div>
        <div className="report-grid">
          {[
            [
              "collections",
              "Collection summary",
              "Daily collection totals by payment method.",
            ],
            [
              "aging",
              "Accounts receivable aging",
              "Current and overdue balances across all aging buckets.",
            ],
            [
              "collectors",
              "Collector remittance",
              "Cash accountability, shortages, and overages.",
            ],
            [
              "revenue",
              "Billing by plan",
              "Invoiced subscription revenue by service plan.",
            ],
            [
              "subscribers",
              "Subscriber master list",
              "Subscriber account, contact, and service status.",
            ],
            [
              "reversals",
              "Payment reversals",
              "Preserved receipts, correction reasons, and actors.",
            ],
          ].map(([type, title, desc]) => (
            <section className="panel report-card" key={type}>
              <div className="report-icon">
                <FileText size={23} />
              </div>
              <h2>{title}</h2>
              <p>{desc}</p>
              <div className="actions">
                <button
                  disabled={!can("report.export") || busy}
                  onClick={() => download(type, "pdf")}
                >
                  <Download size={14} /> PDF
                </button>
                <button
                  disabled={!can("report.export") || busy}
                  onClick={() => download(type, "xlsx")}
                >
                  Excel
                </button>
              </div>
            </section>
          ))}
        </div>
        <p className="muted">
          Subscriber Statements of Account are available from the subscriber’s
          Ledger tab.
        </p>
      </>
    </>
  );
}

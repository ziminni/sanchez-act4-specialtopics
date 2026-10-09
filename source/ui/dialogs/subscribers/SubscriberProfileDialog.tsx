import { Plus } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function SubscriberProfileDialog() {
  const {
    busy,
    setModal,
    profile,
    tab,
    setTab,
    setSelected,
    from,
    setFrom,
    to,
    setTo,
    can,
    openGeneratedForm,
    download,
  } = useApp();
  if (!profile) return null;
  return (
    <>
      <>
        <div className="profile-summary">
          <span className="avatar large">
            {profile.subscriber.name.slice(0, 2)}
          </span>
          <div>
            <strong>{profile.subscriber.account_no}</strong>
            <p>
              {profile.subscriber.address} · {profile.subscriber.contact}
            </p>
          </div>
          <Badge value={profile.subscriber.status} />
        </div>
        <div className="tabs">
          {[
            "Overview",
            "Services",
            "Billing",
            "Payments",
            "Ledger",
            "Collection",
            "Service history",
            "Documents",
            ...(can("audit.view") ? ["Audit"] : []),
          ].map((t) => (
            <button
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
              key={t}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "Overview" && (
          <>
            <div className="collection-kpis">
              <div className="mini-stat">
                Ledger balance
                <strong>{money(profile.ledger.at(-1)?.balance || 0)}</strong>
              </div>
              <div className="mini-stat">
                Service accounts
                <strong>{profile.services.length}</strong>
              </div>
              <div className="mini-stat">
                Payment records
                <strong>{profile.payments.length}</strong>
              </div>
            </div>
            {can("subscriber.edit") && (
              <div className="actions">
                <button onClick={() => setModal("subscriber-edit")}>
                  Edit subscriber
                </button>
                <button onClick={() => setModal("subscriber-status")}>
                  Change status
                </button>
              </div>
            )}
            <p>{profile.subscriber.notes || "No account notes."}</p>
            <p>
              Billing day: {profile.subscriber.billing_day} · Due day:{" "}
              {profile.subscriber.due_day}
            </p>
          </>
        )}
        {tab === "Services" && (
          <>
            <Table
              rows={profile.services}
              columns={[
                ["account_no", "Service"],
                ["plan", "Plan"],
                ["status", "Status", (r) => <Badge value={r.status} />],
                ["rate", "Rate", (r) => money(r.rate)],
                [
                  "action",
                  "",
                  (r) =>
                    can("subscriber.edit") ? (
                      <button
                        onClick={() => {
                          setSelected(r);
                          setModal("rate");
                        }}
                      >
                        Change future rate
                      </button>
                    ) : null,
                ],
              ]}
            />
            {can("subscriber.edit") && (
              <button
                disabled={busy}
                onClick={() => openGeneratedForm("service")}
              >
                <Plus size={15} /> Add service
              </button>
            )}
          </>
        )}
        {tab === "Billing" && (
          <Table
            rows={profile.invoices}
            columns={[
              ["number", "Invoice"],
              ["due_date", "Due", (r) => date(r.due_date)],
              ["status", "Status", (r) => <Badge value={r.status} />],
              ["total", "Total", (r) => money(r.total)],
              ["balance", "Balance", (r) => money(r.balance)],
            ]}
          />
        )}
        {tab === "Payments" && (
          <Table
            rows={profile.payments}
            columns={[
              ["receipt_no", "Receipt"],
              ["paid_at", "Date", (r) => date(r.paid_at)],
              ["method", "Method"],
              ["amount", "Amount", (r) => money(r.amount)],
              [
                "reversed",
                "Status",
                (r) => <Badge value={r.reversed ? "REVERSED" : "POSTED"} />,
              ],
            ]}
          />
        )}
        {tab === "Ledger" && (
          <>
            <div className="actions report-filter">
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
              {can("report.export") && (
                <>
                  <button
                    onClick={() =>
                      download("soa", "pdf", profile.subscriber.id)
                    }
                  >
                    SOA · PDF
                  </button>
                  <button
                    onClick={() =>
                      download("soa", "xlsx", profile.subscriber.id)
                    }
                  >
                    Excel
                  </button>
                </>
              )}
            </div>
            <Table
              rows={profile.ledger}
              columns={[
                ["date", "Date", (r) => date(r.date)],
                ["reference", "Reference"],
                ["description", "Description"],
                ["debit", "Debit", (r) => money(r.debit)],
                ["credit", "Credit", (r) => money(r.credit)],
                ["balance", "Balance", (r) => money(r.balance)],
              ]}
            />
          </>
        )}
        {tab === "Collection" && (
          <Table
            rows={profile.collections}
            columns={[
              ["id", "Batch"],
              ["collector", "Collector"],
              ["status", "Status", (r) => <Badge value={r.status} />],
              ["expected", "Route balance", (r) => money(r.expected)],
            ]}
          />
        )}
        {tab === "Audit" && (
          <Table
            rows={profile.audit}
            columns={[
              ["created_at", "Date", (r) => date(r.created_at)],
              ["action", "Action"],
              ["reason", "Reason"],
            ]}
          />
        )}
        {tab === "Service history" && (
          <Table
            rows={profile.history}
            columns={[
              ["created_at", "Date", (r) => date(r.created_at)],
              ["kind", "Event"],
              ["reason", "Reason"],
            ]}
          />
        )}
        {tab === "Documents" && (
          <Table
            rows={profile.proofs}
            columns={[
              ["reference", "GCash reference"],
              ["amount", "Amount", (r) => money(r.amount)],
              ["status", "Review status", (r) => <Badge value={r.status} />],
            ]}
          />
        )}
      </>
    </>
  );
}

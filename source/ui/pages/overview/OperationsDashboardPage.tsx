import {
  Activity,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CreditCard,
  Plus,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function OperationsDashboardPage() {
  const { data, can, navigate } = useApp();
  return (
    <>
      <>
        <div className="kpis">
          {[
            [
              "Outstanding receivable",
              money(data.kpis.receivable),
              "Across all billed accounts",
              Wallet,
            ],
            [
              "Collected this month",
              money(data.kpis.collected),
              "Posted, non-reversed payments",
              CreditCard,
            ],
            [
              "Overdue balance",
              money(data.kpis.overdue),
              `${data.kpis.overdue_accounts} accounts need attention`,
              Activity,
            ],
            [
              "Active subscribers",
              Number(data.kpis.subscribers).toLocaleString(),
              "Connected to BCIS",
              Users,
            ],
          ].map(([label, value, sub, Icon]: any, i) => (
            <div className="kpi" key={label}>
              <div>
                {label}
                <Icon size={18} />
              </div>
              <strong>{value}</strong>
              <small className={i === 2 ? "amber" : ""}>{sub}</small>
            </div>
          ))}
        </div>
        <div className="dashboard-grid">
          <section className="panel trend">
            <div className="panel-head">
              <div>
                <h2>Billing vs. collection</h2>
                <p>Your last six months of activity</p>
              </div>
              <div className="legend">
                <span>
                  <i />
                  Billed
                </span>
                <span>
                  <i className="light" />
                  Collected
                </span>
              </div>
            </div>
            <div className="chart">
              {data.trend.map((r: Row) => {
                const max = Math.max(
                  1,
                  ...data.trend.flatMap((t: Row) => [
                    Number(t.billed),
                    Number(t.collected),
                  ]),
                );
                return (
                  <div className="chart-group" key={r.month}>
                    <div className="bars">
                      <div
                        title={money(r.billed)}
                        style={{
                          height: `${Math.max(1, (Number(r.billed) / max) * 100)}%`,
                        }}
                      />
                      <div
                        title={money(r.collected)}
                        style={{
                          height: `${Math.max(1, (Number(r.collected) / max) * 100)}%`,
                        }}
                      />
                    </div>
                    <span>{r.month}</span>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Payment methods</h2>
                <p>Collections this month</p>
              </div>
              <CreditCard size={18} />
            </div>
            <div className="method-total">
              {money(data.kpis.collected)}
              <small>Total collected</small>
            </div>
            {data.methods.map((r: Row, i: number) => (
              <div className="method" key={r.method}>
                <div>
                  <span>
                    <i
                      style={{
                        background: ["var(--theme)", "#14b8a6", "#8b5cf6"][
                          i % 3
                        ],
                      }}
                    />
                    {r.method}
                  </span>
                  <strong>{money(r.total)}</strong>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${(Number(r.total) / Math.max(1, Number(data.kpis.collected))) * 100}%`,
                      background: ["var(--theme)", "#14b8a6", "#8b5cf6"][i % 3],
                    }}
                  />
                </div>
              </div>
            ))}
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Receivables aging</h2>
                <p>Outstanding invoice balances</p>
              </div>
              <button className="link" onClick={() => navigate("Receivables")}>
                View accounts <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="aging">
              {["Current", "1–30", "31–60", "61–90", "90+"].map((b, i) => {
                const total =
                  data.aging.find((r: Row) => r.bucket === b)?.total || 0;
                return (
                  <div key={b}>
                    <span>
                      {b}
                      {i > 0 ? " days" : ""}
                    </span>
                    <div className="progress">
                      <span
                        style={{
                          width: `${Math.max(1, (Number(total) / Math.max(1, Number(data.kpis.receivable))) * 100)}%`,
                          background: [
                            "var(--theme)",
                            "color-mix(in srgb, var(--theme) 55%, white)",
                            "#fbbf24",
                            "#f59e0b",
                            "#ef4444",
                          ][i],
                        }}
                      />
                    </div>
                    <strong>{money(total)}</strong>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <div className="panel-head">
              <div>
                <h2>Needs attention</h2>
                <p>Keep operations moving</p>
              </div>
              <Bell size={18} />
            </div>
            <button
              className="alert-row"
              onClick={() => navigate("Receivables")}
            >
              <span className="alert-icon">
                <Activity size={18} />
              </span>
              <div>
                <strong>{data.kpis.overdue_accounts} overdue accounts</strong>
                <small>Review balances and follow up</small>
              </div>
              <ChevronRight size={17} />
            </button>
            {can("payment.verify") && (
              <button
                className="alert-row"
                onClick={() => navigate("GCash Verification")}
              >
                <span className="alert-icon blue">
                  <ShieldCheck size={18} />
                </span>
                <div>
                  <strong>
                    {data.kpis.pending_proofs} GCash proofs pending
                  </strong>
                  <small>Verify before posting payments</small>
                </div>
                <ChevronRight size={17} />
              </button>
            )}
            <div className="info-note">
              <ShieldCheck size={16} /> Financial activity is recorded in the
              audit trail.
            </div>
          </section>
          <section className="panel recent">
            <div className="panel-head">
              <div>
                <h2>Collector performance</h2>
                <p>Posted field collections by assigned batch</p>
              </div>
            </div>
            <Table
              rows={data.collectors}
              columns={[
                ["name", "Collector"],
                ["accounts", "Accounts collected"],
                ["total", "Collected", (r) => money(r.total)],
              ]}
            />
          </section>
          <section className="panel recent">
            <div className="panel-head">
              <div>
                <h2>Recent payments</h2>
                <p>Latest posted collections</p>
              </div>
              {can("subscriber.view") && (
                <button className="link" onClick={() => navigate("Payments")}>
                  View all <ArrowUpRight size={15} />
                </button>
              )}
            </div>
            <Table
              rows={data.recent}
              columns={[
                ["receipt_no", "Receipt"],
                ["name", "Subscriber"],
                ["method", "Method", (r) => <Badge value={r.method} />],
                ["paid_at", "Date", (r) => date(r.paid_at)],
                ["amount", "Amount", (r) => money(r.amount)],
              ]}
            />
          </section>
        </div>
      </>
    </>
  );
}

export function DashboardActions() {
  const { setModal, can } = useApp();
  return (
    <>
      {can("payment.create") && (
        <button className="primary" onClick={() => setModal("payment")}>
          <Plus size={17} /> Receive payment
        </button>
      )}
    </>
  );
}

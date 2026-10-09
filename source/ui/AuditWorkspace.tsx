import React, { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  RotateCcw,
  Scale,
  Search,
  Wallet,
} from "lucide-react";
import { money } from "../shared/domain";
import { Badge, Table, date } from "./components";
type Row = Record<string, any>;
const kinds: Record<string, string> = {
  REVERSAL: "Payment reversal",
  ADJUSTMENT: "Invoice adjustment",
  VOID: "Invoice void",
};
const effect = (r: Row) =>
  r.kind === "REVERSAL"
    ? "Payment reversed"
    : r.kind === "VOID"
      ? "Invoice voided"
      : Number(r.amount) < 0
        ? "Credit"
        : "Debit";
const signed = (r: Row) => {
  const n = Number(r.amount);
  return (
    <span className={r.kind === "ADJUSTMENT" && n > 0 ? "" : "red-text"}>
      {r.kind === "ADJUSTMENT" && n > 0 ? "+" : "−"}
      {money(Math.abs(n))}
    </span>
  );
};
const correctionColumns: [string, string, ((r: Row) => React.ReactNode)?][] = [
  ["created_at", "Date", (r) => date(r.created_at)],
  ["kind", "Type", (r) => <Badge value={r.kind} />],
  [
    "reference",
    "Receipt / invoice",
    (r) => <span className="mono">{r.reference}</span>,
  ],
  [
    "subscriber",
    "Subscriber",
    (r) => (
      <>
        {r.subscriber}
        <small className="audit-sub">{r.account_no}</small>
      </>
    ),
  ],
  ["effect", "Effect", effect],
  ["amount", "Amount", signed],
  ["actor", "Recorded by", (r) => r.actor || "Unknown user"],
  ["reason", "Reason", (r) => <span className="audit-reason">{r.reason}</span>],
];

export function AuditOverview({
  data: d,
  navigate,
}: {
  data: Row;
  navigate: (page: string) => void;
}) {
  const s = d.summary,
    a = d.receivables;
  const corrections =
    Number(s.reversals) + Number(s.adjustments) + Number(s.voids);
  const overdue =
    Number(a.d30) + Number(a.d60) + Number(a.d90) + Number(a.over90);
  const buckets = [
    ["Current", a.current],
    ["1–30 days", a.d30],
    ["31–60 days", a.d60],
    ["61–90 days", a.d90],
    ["Over 90 days", a.over90],
  ];
  const max = Math.max(1, ...buckets.map(([, v]) => Number(v)));
  return (
    <div className="admin-dashboard">
      <section className="admin-health">
        <div className="admin-health-icon">
          <Scale size={26} />
        </div>
        <div>
          <h2>Audit overview</h2>
          <p>
            Corrections recorded in {d.month}, outstanding receivables, and
            recent audit activity.
          </p>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          {
            label: "Corrections this month",
            value: corrections,
            detail: `${s.reversals} reversals · ${s.adjustments} adjustments · ${s.voids} voids`,
            icon: RotateCcw,
            page: "Adjustments & Reversals",
          },
          {
            label: "Payments reversed",
            value: money(s.reversed_amount),
            detail: `${s.reversals} receipts reversed this month`,
            icon: Wallet,
            page: "Adjustments & Reversals",
          },
          {
            label: "Net invoice adjustments",
            value: money(Number(s.credits) + Number(s.debits)),
            detail: `${money(Math.abs(Number(s.credits)))} credits · ${money(s.debits)} debits · ${money(Math.abs(Number(s.voided_amount)))} voided`,
            icon: FileText,
            page: "Adjustments & Reversals",
          },
          {
            label: "Outstanding receivables",
            value: money(a.total),
            detail: `${a.accounts} accounts · ${money(overdue)} overdue`,
            icon: Scale,
            page: "Receivables",
          },
        ].map((x) => (
          <button
            className="panel admin-stat"
            key={x.label}
            onClick={() => navigate(x.page)}
          >
            <span>
              {x.label}
              <x.icon size={18} />
            </span>
            <strong>{x.value}</strong>
            <small>{x.detail}</small>
          </button>
        ))}
      </div>
      <div className="admin-main-grid">
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Recent corrections</h2>
              <p>Latest reversals, adjustments and voids</p>
            </div>
            <button onClick={() => navigate("Adjustments & Reversals")}>
              Review all <ArrowUpRight size={15} />
            </button>
          </div>
          {d.recent.length ? (
            d.recent.map((r: Row) => (
              <div className="admin-event" key={r.kind + r.id}>
                <Badge value={r.kind} />
                <div className="audit-event-text">
                  <strong>
                    {r.reference} · {r.subscriber}
                  </strong>
                  <small>
                    {effect(r)} · {r.actor || "Unknown user"} ·{" "}
                    {date(r.created_at)} · “{r.reason}”
                  </small>
                </div>
                <strong>{signed(r)}</strong>
              </div>
            ))
          ) : (
            <p>No corrections have been recorded.</p>
          )}
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Receivables aging</h2>
              <p>Unpaid balances by days past due</p>
            </div>
            <button onClick={() => navigate("Receivables")}>
              Open receivables <ArrowUpRight size={15} />
            </button>
          </div>
          {buckets.map(([label, value]) => (
            <div className="audit-aging" key={label}>
              <span>{label}</span>
              <div>
                <i
                  className={label === "Current" ? "current" : ""}
                  style={{
                    width: `${Math.max(Number(value) ? 2 : 0, (Number(value) / max) * 100)}%`,
                  }}
                />
              </div>
              <strong>{money(value)}</strong>
            </div>
          ))}
        </section>
      </div>
      <div className="admin-main-grid">
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Corrections by user this month</h2>
              <p>Check that corrections are spread and authorized</p>
            </div>
          </div>
          {d.actors.length ? (
            <div className="admin-role-list">
              {d.actors.map((r: Row) => (
                <div key={r.actor}>
                  <span>{r.actor}</span>
                  <strong>{r.corrections}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p>No corrections recorded this month.</p>
          )}
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Audit trail activity</h2>
              <p>Last 7 days</p>
            </div>
            <button onClick={() => navigate("Audit Trail")}>
              Open audit trail <ArrowUpRight size={15} />
            </button>
          </div>
          <div
            className={`admin-attention ${Number(d.events.corrections) ? "attention" : ""}`}
          >
            {Number(d.events.corrections) ? (
              <AlertTriangle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <div>
              <strong>
                {d.events.corrections} financial corrections · {d.events.events}{" "}
                audit entries
              </strong>
              <p>Every entry keeps the actor, time, and reason.</p>
            </div>
          </div>
          <button onClick={() => navigate("Reports")}>
            <Activity size={15} /> Export reports
          </button>
        </section>
      </div>
    </div>
  );
}

export function Corrections({
  data,
  kind,
  setKind,
  search,
  setSearch,
  from,
  to,
  setFrom,
  setTo,
  canCorrect,
  request,
  openCorrection,
}: {
  data: Row;
  kind: string;
  setKind: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  canCorrect: boolean;
  request: (url: string) => Promise<any>;
  openCorrection: (modal: "reverse" | "adjust" | "void", record: Row) => void;
}) {
  const [lookup, setLookup] = useState(""),
    [found, setFound] = useState<Row | null>(null),
    [error, setError] = useState("");
  const find = async (value = lookup) => {
    setError("");
    if (value.trim().length < 2) return setFound(null);
    try {
      setFound(
        await request(
          `/corrections/lookup?search=${encodeURIComponent(value.trim())}`,
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // Refresh lookup results after a correction reloads the page data.
  useEffect(() => {
    if (found) find();
  }, [data]);
  const total = (k: string) =>
    data.summary.find((r: Row) => r.kind === k) || { count: 0, amount: 0 };
  return (
    <div className="admin-dashboard">
      <div className="admin-stat-grid">
        {[
          ["REVERSAL", "Payments reversed", RotateCcw],
          ["ADJUSTMENT", "Invoice adjustments", FileText],
          ["VOID", "Invoices voided", Scale],
        ].map(([k, label, Icon]: any) => (
          <button
            key={k}
            className={`panel admin-stat ${kind === k ? "selected" : ""}`}
            aria-pressed={kind === k}
            onClick={() => setKind(kind === k ? "" : k)}
          >
            <span>
              {label}
              <Icon size={18} />
            </span>
            <strong>{total(k).count}</strong>
            <small>
              {k === "ADJUSTMENT"
                ? `Net ${money(total(k).amount)}`
                : money(Math.abs(Number(total(k).amount)))}{" "}
              · {from} to {to}
            </small>
          </button>
        ))}
        <div className="panel admin-stat">
          <span>All corrections</span>
          <strong>
            {data.summary.reduce((a: number, r: Row) => a + Number(r.count), 0)}
          </strong>
          <small>Original receipts and invoices are never edited.</small>
        </div>
      </div>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Correction register</h2>
            <p>
              {kind
                ? kinds[kind] + "s"
                : "All reversals, adjustments and voids"}{" "}
              · showing {data.rows.length}
              {data.rows.length === 50 ? " (first 50)" : ""}
            </p>
          </div>
        </div>
        <div className="collection-period corrections-filters">
          <label>
            Type
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="">All corrections</option>
              {Object.entries(kinds).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              value={to}
              min={from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </label>
          <label className="corrections-search">
            Search
            <input
              value={search}
              placeholder="Receipt, invoice, subscriber, reason or user"
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <Table rows={data.rows} columns={correctionColumns} />
      </section>
      {canCorrect && (
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Make a correction</h2>
              <p>
                Find a receipt or invoice. Every correction needs a reason and
                is added to the register and audit trail.
              </p>
            </div>
          </div>
          <form
            className="audit-lookup"
            onSubmit={(e) => {
              e.preventDefault();
              find();
            }}
          >
            <input
              aria-label="Find receipt or invoice"
              value={lookup}
              placeholder="Receipt no., invoice no., subscriber name or account"
              onChange={(e) => setLookup(e.target.value)}
            />
            <button className="primary" disabled={lookup.trim().length < 2}>
              <Search size={15} /> Find
            </button>
          </form>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {found && (
            <>
              <h3 className="audit-lookup-title">Payments</h3>
              <Table
                rows={found.payments}
                columns={[
                  [
                    "receipt_no",
                    "Receipt",
                    (r) => <span className="mono">{r.receipt_no}</span>,
                  ],
                  ["name", "Subscriber"],
                  ["paid_at", "Paid on", (r) => date(r.paid_at)],
                  ["method", "Method"],
                  ["amount", "Amount", (r) => money(r.amount)],
                  [
                    "reversed",
                    "Status",
                    (r) => <Badge value={r.reversed ? "REVERSED" : "POSTED"} />,
                  ],
                  [
                    "action",
                    "",
                    (r) =>
                      !r.reversed && (
                        <button
                          className="danger"
                          onClick={() => openCorrection("reverse", r)}
                        >
                          Reverse
                        </button>
                      ),
                  ],
                ]}
              />
              <h3 className="audit-lookup-title">Invoices</h3>
              <Table
                rows={found.invoices}
                columns={[
                  [
                    "number",
                    "Invoice",
                    (r) => <span className="mono">{r.number}</span>,
                  ],
                  ["name", "Subscriber"],
                  ["period", "Period", (r) => String(r.period).slice(0, 7)],
                  ["status", "Status", (r) => <Badge value={r.status} />],
                  ["total", "Billed", (r) => money(r.total)],
                  ["adjusted", "Adjusted", (r) => money(r.adjusted)],
                  ["balance", "Balance", (r) => money(r.balance)],
                  [
                    "action",
                    "",
                    (r) =>
                      !["VOID", "DRAFT", "CREDITED"].includes(r.status) && (
                        <div className="actions">
                          <button onClick={() => openCorrection("adjust", r)}>
                            Adjust
                          </button>
                          <button onClick={() => openCorrection("void", r)}>
                            Void
                          </button>
                        </div>
                      ),
                  ],
                ]}
              />
            </>
          )}
        </section>
      )}
    </div>
  );
}

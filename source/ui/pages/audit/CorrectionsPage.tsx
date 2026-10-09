import { FileText, RotateCcw, Scale, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { money } from "../../../shared/domain";
import { api } from "../../api/client";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";
import { correctionColumns, kinds } from "./shared";

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

export function CorrectionsPage() {
  const {
    data,
    search,
    setSearch,
    setPageNo,
    setModal,
    setSelected,
    from,
    setFrom,
    to,
    setTo,
    correctionKind,
    setCorrectionKind,
    can,
  } = useApp();
  return (
    <>
      <Corrections
        data={data}
        kind={correctionKind}
        setKind={(v) => {
          setCorrectionKind(v);
          setPageNo(1);
        }}
        search={search}
        setSearch={setSearch}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        canCorrect={Boolean(can("payment.reverse"))}
        request={api}
        openCorrection={(m, r) => {
          setSelected(r);
          setModal(m);
        }}
      />
    </>
  );
}

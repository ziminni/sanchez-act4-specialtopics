import { BookOpen, Download, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { money } from "../../../shared/domain";
import { api } from "../../api/client";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function Ledger({
  rows,
  search,
  setSearch,
  from,
  to,
  setFrom,
  setTo,
  request,
  download,
  selectedId,
  setSelectedId,
}: {
  rows: Row[];
  search: string;
  setSearch: (v: string) => void;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  request: (url: string) => Promise<any>;
  download: (type: string, format: string, subscriberId?: number) => void;
  selectedId: number | null;
  setSelectedId: (id: number) => void;
}) {
  const [ledger, setLedger] = useState<Row | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (selectedId === null) return;
    let active = true;
    setLoading(true);
    setError("");
    request(`/ledger/${selectedId}`)
      .then((r) => active && setLedger(r))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [selectedId]);
  const s = ledger?.subscriber;
  return (
    <div className="ledger-workspace">
      <section className="panel ledger-list">
        <label className="ledger-search">
          <Search size={16} />
          <input
            aria-label="Search subscribers"
            placeholder="Search name or account no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <p className="admin-note">
          {rows.length === 25
            ? "Showing the first 25 matches. Refine your search."
            : `${rows.length} subscriber${rows.length === 1 ? "" : "s"}`}
        </p>
        <div className="ledger-results" role="listbox" aria-label="Subscribers">
          {rows.map((r) => (
            <button
              key={r.id}
              role="option"
              aria-selected={r.id === selectedId}
              className={r.id === selectedId ? "selected" : ""}
              onClick={() => setSelectedId(r.id)}
            >
              <span>
                <strong>{r.name}</strong>
                <small>
                  {r.account_no} · {r.area || "No area"}
                </small>
              </span>
              <span className={Number(r.outstanding) > 0 ? "red-text" : ""}>
                {money(r.outstanding)}
              </span>
            </button>
          ))}
          {!rows.length && <p className="admin-note">No subscribers found.</p>}
        </div>
      </section>
      <section className="panel ledger-detail">
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {!s ? (
          <div className="empty">
            <BookOpen size={28} />
            <h3>Select a subscriber</h3>
            <p>Their complete ledger and statement of account appear here.</p>
          </div>
        ) : (
          <>
            <div className="admin-section-title">
              <div>
                <h2>{s.name}</h2>
                <p>
                  {s.account_no} · {s.address} · {s.area || "No area"} ·
                  Collector: {s.collector || "Unassigned"}
                </p>
              </div>
              <Badge value={s.status} />
            </div>
            <div className="collection-kpis">
              <div className="mini-stat">
                Total billed &amp; debits
                <strong>{money(ledger!.debits)}</strong>
              </div>
              <div className="mini-stat">
                Total paid &amp; credits
                <strong>{money(ledger!.credits)}</strong>
              </div>
              <div className="mini-stat">
                {Number(ledger!.balance) < 0 ? "Advance credit" : "Balance due"}
                <strong
                  className={Number(ledger!.balance) > 0 ? "red-text" : ""}
                >
                  {money(Math.abs(Number(ledger!.balance)))}
                </strong>
              </div>
            </div>
            <div className="collection-period ledger-soa">
              <strong>Statement of account</strong>
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
              <div className="actions">
                <button onClick={() => download("soa", "pdf", s.id)}>
                  <Download size={15} /> SOA PDF
                </button>
                <button onClick={() => download("soa", "xlsx", s.id)}>
                  <Download size={15} /> Excel
                </button>
              </div>
            </div>
            {loading ? (
              <div className="loading">Loading ledger…</div>
            ) : (
              <Table
                rows={ledger!.rows}
                columns={[
                  ["date", "Date", (r) => date(r.date)],
                  [
                    "reference",
                    "Reference",
                    (r) => <span className="mono">{r.reference}</span>,
                  ],
                  ["description", "Description"],
                  [
                    "debit_amount",
                    "Debit",
                    (r) => (Number(r.debit) ? money(r.debit) : "—"),
                  ],
                  [
                    "credit_amount",
                    "Credit",
                    (r) => (Number(r.credit) ? money(r.credit) : "—"),
                  ],
                  ["balance", "Balance", (r) => money(r.balance)],
                ]}
              />
            )}
            <p className="admin-note">
              Full history, oldest first. Reversals and adjustments appear as
              separate entries; original records are never edited.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

export function LedgerPage() {
  const {
    search,
    setSearch,
    from,
    setFrom,
    to,
    setTo,
    ledgerId,
    setLedgerId,
    download,
    rows,
  } = useApp();
  return (
    <>
      <Ledger
        rows={rows}
        search={search}
        setSearch={setSearch}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        request={api}
        download={download}
        selectedId={ledgerId}
        setSelectedId={setLedgerId}
      />
    </>
  );
}

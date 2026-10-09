import React from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Plus,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { money } from "../shared/domain";
import { Badge, Table, date } from "./components";
type Row = Record<string, any>;
const batchNo = (id: number) => `BATCH-${String(id).padStart(4, "0")}`;
const rate = (collected: any, expected: any) =>
  Number(expected) > 0
    ? Math.round((Number(collected) / Number(expected)) * 100)
    : null;
const nextStep: Record<string, string> = {
  OPEN: "Submit batch",
  IN_PROGRESS: "Submit batch",
  SUBMITTED: "Record remittance",
  REMITTED: "Confirm reconciliation",
  RECONCILED: "Approve and close",
};
function Variance({ value }: { value: any }) {
  if (value === null || value === undefined) return <>—</>;
  const n = Number(value);
  return (
    <span className={n < 0 ? "red-text" : n > 0 ? "green-text" : ""}>
      {n > 0 ? "+" : ""}
      {money(n)}
    </span>
  );
}
function RateBar({ collected, expected }: { collected: any; expected: any }) {
  const r = rate(collected, expected);
  if (r === null) return <span className="admin-note">No batches</span>;
  return (
    <div
      className="collection-rate"
      title={`${r}% of expected balances collected`}
    >
      <div>
        <i style={{ width: `${Math.min(100, r)}%` }} />
      </div>
      <span>{r}%</span>
    </div>
  );
}
function Intro({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <section className="admin-health">
      <div className="admin-health-icon">
        <Icon size={26} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

export function CollectionOverview({
  data: d,
  navigate,
  openBatch,
}: {
  data: Row;
  navigate: (page: string) => void;
  openBatch: (batch: Row) => void;
}) {
  const waiting =
    Number(d.awaiting_remittance) +
    Number(d.awaiting_reconciliation) +
    Number(d.awaiting_close);
  return (
    <div className="admin-dashboard">
      <Intro
        icon={Truck}
        title="Collection overview"
        text={`${d.areas} areas / routes · ${d.collectors} active collectors`}
      />
      <div className="admin-stat-grid">
        {[
          {
            label: "Open batches",
            value: d.open_batches,
            detail: `${money(d.open_expected)} expected in the field`,
            icon: Truck,
            page: "Batches",
          },
          {
            label: "Awaiting remittance",
            value: d.awaiting_remittance,
            detail: "Submitted batches · cash not yet turned over",
            icon: Wallet,
            page: "Remittance & Reconciliation",
          },
          {
            label: "Awaiting reconciliation",
            value: Number(d.awaiting_reconciliation) + Number(d.awaiting_close),
            detail: `${d.awaiting_reconciliation} to reconcile · ${d.awaiting_close} to close`,
            icon: ClipboardCheck,
            page: "Remittance & Reconciliation",
          },
          {
            label: "Collected today",
            value: money(d.collected.today),
            detail: `${money(d.collected.month)} this month through batches`,
            icon: TrendingUp,
            page: "Collector Performance",
          },
        ].map((s) => (
          <button
            className="panel admin-stat"
            key={s.label}
            onClick={() => navigate(s.page)}
          >
            <span>
              {s.label}
              <s.icon size={18} />
            </span>
            <strong>{s.value}</strong>
            <small>{s.detail}</small>
          </button>
        ))}
      </div>
      <div className="admin-main-grid">
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Needs your action</h2>
              <p>Oldest submitted, remitted and reconciled batches first</p>
            </div>
            <button onClick={() => navigate("Remittance & Reconciliation")}>
              Open queue <ArrowUpRight size={15} />
            </button>
          </div>
          {d.attention.length ? (
            d.attention.map((b: Row) => (
              <div className="admin-event collection-task" key={b.id}>
                <Badge value={b.status} />
                <div>
                  <strong>
                    {batchNo(b.id)} · {b.collector}
                  </strong>
                  <small>
                    {b.area || "No area"} · created {date(b.created_at)}
                  </small>
                </div>
                <button onClick={() => openBatch(b)}>
                  {nextStep[b.status]}
                </button>
              </div>
            ))
          ) : (
            <div className="admin-attention">
              <CheckCircle2 size={19} />
              <div>
                <strong>Nothing waiting</strong>
                <p>No batches are waiting for remittance or reconciliation.</p>
              </div>
            </div>
          )}
          {waiting > d.attention.length && (
            <p className="admin-note">
              Showing {d.attention.length} of {waiting} waiting batches.
            </p>
          )}
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Remittance variance</h2>
              <p>Remittances recorded this month ({d.month})</p>
            </div>
          </div>
          <div
            className={`admin-attention ${Number(d.variance.shortages) ? "attention" : ""}`}
          >
            {Number(d.variance.shortages) ? (
              <AlertTriangle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <div>
              <strong>
                {Number(d.variance.shortages)
                  ? `${d.variance.shortages} short remittance${Number(d.variance.shortages) === 1 ? "" : "s"} · ${money(d.variance.shortage_total)}`
                  : "No short remittances this month"}
              </strong>
              <p>
                Shortages and overages stay on record after a batch is closed.
              </p>
            </div>
          </div>
          <div className="admin-system-row">
            <span>Net difference this month</span>
            <strong>
              <Variance value={d.variance.net} />
            </strong>
          </div>
          <button onClick={() => navigate("Remittance & Reconciliation")}>
            View remittance history <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Collector performance this month</h2>
            <p>Top collectors by amount collected through batches</p>
          </div>
          <button onClick={() => navigate("Collector Performance")}>
            All collectors <ArrowUpRight size={15} />
          </button>
        </div>
        <Table
          rows={d.topCollectors}
          columns={[
            ["name", "Collector"],
            ["batches", "Batches"],
            ["accounts", "Accounts paid"],
            ["collected_amount", "Collected", (r) => money(r.collected)],
            [
              "rate",
              "Collection rate",
              (r) => <RateBar collected={r.collected} expected={r.expected} />,
            ],
            [
              "difference",
              "Remittance difference",
              (r) => <Variance value={r.difference} />,
            ],
          ]}
        />
      </section>
    </div>
  );
}

export function AreasRoutes({
  data,
  canManage,
  openModal,
}: {
  data: Row;
  canManage: boolean;
  openModal: (modal: "area" | "collector" | "batch") => void;
}) {
  return (
    <div className="admin-dashboard">
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Collection areas / routes</h2>
            <p>
              {data.areas.length} areas · outstanding balances of billed
              subscribers
            </p>
          </div>
          {canManage && (
            <button onClick={() => openModal("area")}>
              <Plus size={15} /> Add area / route
            </button>
          )}
        </div>
        <Table
          rows={data.areas}
          columns={[
            ["name", "Area / route"],
            ["active_subscribers", "Active subscribers"],
            ["collectors", "Assigned collectors"],
            ["outstanding", "Outstanding", (r) => money(r.outstanding)],
            ["active_batches", "Active batches"],
            ["last_batch", "Last batch", (r) => date(r.last_batch)],
          ]}
        />
      </section>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Collectors</h2>
            <p>Assignments come from each subscriber's area and collector</p>
          </div>
          {canManage && (
            <div className="actions">
              <button onClick={() => openModal("collector")}>
                <Plus size={15} /> Add collector
              </button>
              <button className="primary" onClick={() => openModal("batch")}>
                <Plus size={15} /> New batch
              </button>
            </div>
          )}
        </div>
        <Table
          rows={data.collectors}
          columns={[
            ["name", "Collector"],
            [
              "active",
              "Status",
              (r) => <Badge value={r.active ? "ACTIVE" : "INACTIVE"} />,
            ],
            ["assigned", "Active subscribers"],
            ["areas", "Areas / routes"],
          ]}
        />
      </section>
    </div>
  );
}

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

export function CollectorPerformance({
  data,
  from,
  to,
  setFrom,
  setTo,
  download,
}: {
  data: Row;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  download: (type: string, format: string) => void;
}) {
  const rows: Row[] = data.rows;
  const total = (k: string) => rows.reduce((a, r) => a + Number(r[k]), 0);
  return (
    <div className="admin-dashboard">
      <section className="panel filters collection-period">
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
        <p className="admin-note">
          Batches created in this period. Collection rate = collected ÷ expected
          balances.
        </p>
        <div className="actions">
          <button onClick={() => download("collectors", "pdf")}>
            <Download size={15} /> Remittance report PDF
          </button>
          <button onClick={() => download("collectors", "xlsx")}>
            <Download size={15} /> Excel
          </button>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          ["Batches", total("batches"), `${total("closed")} closed`],
          [
            "Collected",
            money(total("collected")),
            `${money(total("expected"))} expected`,
          ],
          [
            "Collection rate",
            rate(total("collected"), total("expected")) === null
              ? "—"
              : `${rate(total("collected"), total("expected"))}%`,
            "Across all collectors",
          ],
          [
            "Remittance difference",
            <Variance value={total("difference")} key="v" />,
            `${total("shortages")} short remittances`,
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
        <Table
          rows={rows}
          columns={[
            [
              "name",
              "Collector",
              (r) => (r.active ? r.name : `${r.name} (inactive)`),
            ],
            ["assigned", "Assigned"],
            ["batches", "Batches", (r) => `${r.batches} (${r.closed} closed)`],
            ["accounts", "Accounts paid"],
            ["expected", "Expected", (r) => money(r.expected)],
            ["collected_amount", "Collected", (r) => money(r.collected)],
            [
              "rate",
              "Collection rate",
              (r) => <RateBar collected={r.collected} expected={r.expected} />,
            ],
            ["remitted_cash", "Cash remitted", (r) => money(r.remitted)],
            [
              "difference",
              "Difference",
              (r) => <Variance value={r.difference} />,
            ],
            ["shortages", "Shortages"],
          ]}
        />
      </section>
    </div>
  );
}

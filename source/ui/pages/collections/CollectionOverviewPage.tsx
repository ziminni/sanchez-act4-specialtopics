import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";
import { Intro, RateBar, Variance, batchNo, nextStep } from "./shared";

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

export function CollectionOverviewPage() {
  const { data, setModal, setSelected, navigate } = useApp();
  return (
    <>
      <CollectionOverview
        data={data}
        navigate={navigate}
        openBatch={(b) => {
          setSelected(b);
          setModal("reconcile");
        }}
      />
    </>
  );
}

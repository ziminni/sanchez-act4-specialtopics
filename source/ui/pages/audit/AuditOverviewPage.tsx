import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileText,
  RotateCcw,
  Scale,
  Wallet,
} from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { useApp } from "../../app/AppContext";
import { effect, signed } from "./shared";

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

export function AuditOverviewPage() {
  const { data, navigate } = useApp();
  return (
    <>
      <AuditOverview data={data} navigate={navigate} />
    </>
  );
}

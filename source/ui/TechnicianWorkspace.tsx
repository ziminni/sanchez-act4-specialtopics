import React, { useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  Clock,
  PauseCircle,
  PlugZap,
  Wifi,
  Wrench,
} from "lucide-react";
import { Badge, Table, date } from "./components";
type Row = Record<string, any>;
const who = (r: Row) =>
  r.technician || (r.technician_id ? "Another technician" : "Unassigned");
function Customer({ r }: { r: Row }) {
  return (
    <>
      {r.subscriber}
      <small className="audit-sub">
        {r.contact || "No contact"} · {r.area || "No area"}
      </small>
    </>
  );
}
function Ready({ r }: { r: Row }) {
  return r.ready ? (
    <span className="field-ready">Cleared to reconnect</span>
  ) : (
    <span className="field-blocked">Awaiting payment clearance</span>
  );
}
function CompleteButton({
  r,
  userId,
  complete,
}: {
  r: Row;
  userId: number;
  complete: (id: number) => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  if (r.completed_at) return null;
  if (r.technician_id && r.technician_id !== userId)
    return <span className="admin-note">Assigned to {who(r)}</span>;
  if (!r.ready)
    return (
      <button disabled title="Overdue charges must be cleared first">
        Complete
      </button>
    );
  return confirming ? (
    <div className="actions">
      <button
        className="primary"
        onClick={async () => {
          await complete(r.id);
          setConfirming(false);
        }}
      >
        Confirm reconnected
      </button>
      <button onClick={() => setConfirming(false)}>Cancel</button>
    </div>
  ) : (
    <button className="primary" onClick={() => setConfirming(true)}>
      <PlugZap size={14} /> Complete
    </button>
  );
}
const serviceColumns: [string, string, ((r: Row) => React.ReactNode)?][] = [
  [
    "account_no",
    "Service account",
    (r) => <span className="mono">{r.account_no}</span>,
  ],
  ["subscriber", "Subscriber", (r) => <Customer r={r} />],
  ["address", "Installation address"],
  ["plan", "Plan", (r) => `${r.plan} · ${r.plan_type}`],
];

export function FieldOverview({
  data: d,
  navigate,
  userId,
  complete,
}: {
  data: Row;
  navigate: (page: string) => void;
  userId: number;
  complete: (id: number) => Promise<void>;
}) {
  const r = d.reconnections;
  return (
    <div className="admin-dashboard">
      <section className="admin-health">
        <div className="admin-health-icon">
          <Wrench size={26} />
        </div>
        <div>
          <h2>Field overview</h2>
          <p>
            Service status, suspensions and reconnection work. Billing amounts
            are not shown in this workspace.
          </p>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          {
            label: "Reconnections to do",
            value: r.pending,
            detail: `${r.mine} assigned to you · ${r.unassigned} unassigned · ${r.ready} cleared`,
            icon: PlugZap,
            page: "Reconnections",
          },
          {
            label: "Suspended services",
            value: d.suspended,
            detail: "Currently disconnected",
            icon: PauseCircle,
            page: "Suspensions",
          },
          {
            label: "Due for suspension",
            value: d.candidates,
            detail: "Active services past the suspension policy",
            icon: Clock,
            page: "Suspensions",
          },
          {
            label: "Active services",
            value: d.active,
            detail: `${r.completed_week} reconnections completed in 7 days`,
            icon: Wifi,
            page: "Service Accounts",
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
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Your reconnection queue</h2>
            <p>Assigned to you or unassigned · oldest request first</p>
          </div>
          <button onClick={() => navigate("Reconnections")}>
            All reconnections <ArrowUpRight size={15} />
          </button>
        </div>
        <Table
          rows={d.queue}
          columns={[
            ...serviceColumns,
            ["requested_at", "Requested", (x) => date(x.requested_at)],
            ["ready", "Clearance", (x) => <Ready r={x} />],
            [
              "actions",
              "",
              (x) => (
                <CompleteButton r={x} userId={userId} complete={complete} />
              ),
            ],
          ]}
        />
      </section>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Recent service activity</h2>
            <p>Suspensions, reconnections and status changes</p>
          </div>
        </div>
        {d.events.length ? (
          d.events.map((e: Row) => (
            <div className="admin-event" key={e.id}>
              <Badge value={e.kind} />
              <div className="audit-event-text">
                <strong>
                  {e.account_no} · {e.subscriber}
                </strong>
                <small>
                  {e.actor || "System"} · {date(e.created_at)} · {e.reason}
                </small>
              </div>
            </div>
          ))
        ) : (
          <p>No service activity recorded yet.</p>
        )}
      </section>
    </div>
  );
}

export function ServiceAccounts({
  rows,
  search,
  setSearch,
  status,
  setStatus,
}: {
  rows: Row[];
  search: string;
  setSearch: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
}) {
  return (
    <section className="panel admin-section">
      <div className="collection-period corrections-filters">
        <label className="corrections-search">
          Search
          <input
            value={search}
            placeholder="Account, subscriber, address, area or plan"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </label>
      </div>
      <Table
        rows={rows}
        columns={[
          ...serviceColumns,
          ["status", "Status", (r) => <Badge value={r.status} />],
          ["activation_date", "Activated", (r) => date(r.activation_date)],
          ["last_event", "Last service event", (r) => r.last_event || "—"],
        ]}
      />
      {rows.length === 50 && (
        <p className="admin-note">Showing the first 50. Refine your search.</p>
      )}
    </section>
  );
}

export function Suspensions({ data }: { data: Row }) {
  return (
    <div className="admin-dashboard">
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Suspended services</h2>
            <p>
              {data.suspended.length} disconnected · latest suspension record
              for each
            </p>
          </div>
        </div>
        <Table
          rows={data.suspended}
          columns={[
            ...serviceColumns,
            ["effective_date", "Suspended on", (r) => date(r.effective_date)],
            [
              "days_suspended",
              "Days",
              (r) => (r.days_suspended === null ? "—" : r.days_suspended),
            ],
            [
              "reason",
              "Reason",
              (r) => <span className="audit-reason">{r.reason || "—"}</span>,
            ],
            ["approver", "Approved by", (r) => r.approver || "—"],
            [
              "reconnection_requested",
              "Reconnection",
              (r) =>
                r.reconnection_requested ? <Badge value="REQUESTED" /> : "—",
            ],
          ]}
        />
      </section>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Due for suspension</h2>
            <p>
              Active services past the overdue policy. Suspension is approved by
              the office; this list is for field planning.
            </p>
          </div>
        </div>
        <Table
          rows={data.candidates}
          columns={[
            ...serviceColumns,
            ["oldest_due", "Oldest unpaid due date", (r) => date(r.oldest_due)],
            ["days_overdue", "Days overdue"],
          ]}
        />
      </section>
    </div>
  );
}

export function Reconnections({
  rows,
  view,
  setView,
  userId,
  complete,
}: {
  rows: Row[];
  view: string;
  setView: (v: string) => void;
  userId: number;
  complete: (id: number) => Promise<void>;
}) {
  return (
    <section className="panel admin-section">
      <div className="admin-section-title">
        <div>
          <h2>
            {view === "pending"
              ? "Pending reconnections"
              : "Completed reconnections"}
          </h2>
          <p>
            {view === "pending"
              ? "Yours first, then unassigned and others. Complete only after the service is physically restored."
              : "Latest 100 completed requests"}
          </p>
        </div>
        <div className="segmented" role="tablist">
          {[
            ["pending", "Pending"],
            ["completed", "Completed"],
          ].map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={view === k}
              className={view === k ? "active" : ""}
              onClick={() => setView(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <Table
        rows={rows}
        columns={[
          ...serviceColumns,
          ["requested_at", "Requested", (r) => date(r.requested_at)],
          ["technician", "Assigned to", who],
          ...(view === "pending"
            ? ([
                ["ready", "Clearance", (r: Row) => <Ready r={r} />],
                [
                  "actions",
                  "",
                  (r: Row) => (
                    <CompleteButton r={r} userId={userId} complete={complete} />
                  ),
                ],
              ] as [string, string, (r: Row) => React.ReactNode][])
            : ([
                ["completed_at", "Completed", (r: Row) => date(r.completed_at)],
                [
                  "status",
                  "Service now",
                  (r: Row) => <Badge value={r.status} />,
                ],
              ] as [string, string, (r: Row) => React.ReactNode][])),
        ]}
      />
      {view === "pending" && (
        <p className="admin-note">
          <CheckCircle2 size={13} /> “Cleared to reconnect” means the account
          has no overdue charges; the office handles payments.
        </p>
      )}
    </section>
  );
}

import React, { useState } from "react";
import { PlugZap } from "lucide-react";
import type { Row } from "../../lib/types";

export const who = (r: Row) =>
  r.technician || (r.technician_id ? "Another technician" : "Unassigned");
export function Customer({ r }: { r: Row }) {
  return (
    <>
      {r.subscriber}
      <small className="audit-sub">
        {r.contact || "No contact"} · {r.area || "No area"}
      </small>
    </>
  );
}
export function Ready({ r }: { r: Row }) {
  return r.ready ? (
    <span className="field-ready">Cleared to reconnect</span>
  ) : (
    <span className="field-blocked">Awaiting payment clearance</span>
  );
}
export function CompleteButton({
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
export const serviceColumns: [
  string,
  string,
  ((r: Row) => React.ReactNode)?,
][] = [
  [
    "account_no",
    "Service account",
    (r) => <span className="mono">{r.account_no}</span>,
  ],
  ["subscriber", "Subscriber", (r) => <Customer r={r} />],
  ["address", "Installation address"],
  ["plan", "Plan", (r) => `${r.plan} · ${r.plan_type}`],
];

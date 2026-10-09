import React from "react";
import { CheckCircle2 } from "lucide-react";
import { api } from "../../api/client";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";
import { CompleteButton, Ready, serviceColumns, who } from "./shared";

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

export function ReconnectionsPage() {
  const { user, setNotice, reconView, setReconView, run, reload, rows } =
    useApp();
  if (!user) return null;
  return (
    <>
      <Reconnections
        rows={rows}
        view={reconView}
        setView={setReconView}
        userId={user.id}
        complete={async (id: number) =>
          run(async () => {
            await api(`/reconnections/${id}/complete`, {});
            await reload();
            setNotice("Reconnection completed. The service is active again.");
          })
        }
      />
    </>
  );
}

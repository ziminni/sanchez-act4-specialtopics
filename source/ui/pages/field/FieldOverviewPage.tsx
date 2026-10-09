import {
  ArrowUpRight,
  Clock,
  PauseCircle,
  PlugZap,
  Wifi,
  Wrench,
} from "lucide-react";
import { api } from "../../api/client";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";
import { CompleteButton, Ready, serviceColumns } from "./shared";

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

export function FieldOverviewPage() {
  const { user, setNotice, data, run, reload, navigate } = useApp();
  if (!user) return null;
  return (
    <>
      <FieldOverview
        data={data}
        navigate={navigate}
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

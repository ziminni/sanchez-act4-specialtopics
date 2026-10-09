import React from "react";
import {
  ShieldCheck,
  Users,
  Activity,
  Database,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Settings,
} from "lucide-react";
const stamp = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
const events: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login_failed": "Sign-in failed",
  "auth.access_denied": "Access denied",
  "user.create": "User created",
  "user.status": "User access updated",
  "user.profile_picture": "Profile picture updated",
  "backup.create": "Backup created",
  "backup.verify": "Backup verification",
  "system.settings.update": "System settings updated",
};
export function AdminDashboard({
  data: d,
  navigate,
}: {
  data: any;
  navigate: (page: string) => void;
}) {
  const backupAge = d.latestBackup
    ? Math.max(
        0,
        Math.floor(
          (Date.parse(d.checkedAt) - Date.parse(d.latestBackup.created_at)) /
            86400000,
        ),
      )
    : null;
  const backupNeedsAttention =
    backupAge === null ||
    backupAge >= 1 ||
    d.latestBackup.status !== "VERIFIED_ARCHIVE";
  const max = Math.max(
    1,
    ...d.trend.flatMap((r: any) => [r.signins, r.alerts]),
  );
  const uptime =
    d.uptimeSeconds < 3600
      ? `${Math.floor(d.uptimeSeconds / 60)} minutes`
      : `${Math.floor(d.uptimeSeconds / 3600)}h ${Math.floor((d.uptimeSeconds % 3600) / 60)}m`;
  return (
    <div className="admin-dashboard">
      <section className="admin-health">
        <div className="admin-health-icon">
          <ShieldCheck size={26} />
        </div>
        <div>
          <h2>Administration overview</h2>
          <p>Access, security and recovery in one place.</p>
        </div>
        <span>
          <i /> API responding · Database connected
        </span>
      </section>
      <div className="admin-stat-grid">
        {[
          {
            label: "User accounts",
            value: d.users,
            detail: `${d.active_users} active · ${d.users - d.active_users} inactive`,
            icon: Users,
            page: "User Management",
          },
          {
            label: "Active sessions",
            value: d.sessions,
            detail: `Across ${d.signed_in_users} users · unexpired sessions`,
            icon: Activity,
            page: "User Management",
          },
          {
            label: "Security events to review",
            value: d.security_alerts,
            detail: "Failed or denied attempts · last 24 hours",
            icon: ShieldCheck,
            page: "Security Audit",
          },
          {
            label: "Recorded backups",
            value: d.backups,
            detail: d.latestBackup
              ? `Latest: ${stamp(d.latestBackup.created_at)}`
              : "No backup recorded",
            icon: Database,
            page: "Backup Restore",
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
              <h2>Security activity</h2>
              <p>Last 7 calendar days · Philippine time</p>
            </div>
            <button onClick={() => navigate("Security Audit")}>
              View audit <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="admin-chart-legend">
            <span>
              <i /> Successful sign-ins
            </span>
            <span>
              <i /> Failed / denied
            </span>
          </div>
          <div
            className="admin-chart"
            role="img"
            aria-label="Successful sign-ins and failed or denied attempts for the last seven days"
          >
            {d.trend.map((r: any) => (
              <div className="admin-chart-day" key={r.day}>
                <div className="admin-chart-bars">
                  <div
                    className="signin"
                    style={{
                      height: `${Math.max(2, (r.signins / max) * 110)}px`,
                    }}
                    title={`${r.signins} successful sign-ins`}
                  >
                    <span>{r.signins}</span>
                  </div>
                  <div
                    className="alert"
                    style={{
                      height: `${Math.max(2, (r.alerts / max) * 110)}px`,
                    }}
                    title={`${r.alerts} failed or denied attempts`}
                  >
                    <span>{r.alerts}</span>
                  </div>
                </div>
                <small>
                  {new Intl.DateTimeFormat("en-PH", {
                    month: "short",
                    day: "numeric",
                    timeZone: "Asia/Manila",
                  }).format(new Date(r.day + "T00:00:00+08:00"))}
                </small>
              </div>
            ))}
          </div>
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Attention & recovery</h2>
              <p>Items worth checking</p>
            </div>
          </div>
          <div
            className={`admin-attention ${d.security_alerts ? "attention" : ""}`}
          >
            {d.security_alerts ? (
              <AlertTriangle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <div>
              <strong>
                {d.security_alerts
                  ? `${d.security_alerts} security events to review`
                  : "No failed or denied attempts in 24 hours"}
              </strong>
              <p>Review access attempts in Security Audit.</p>
            </div>
          </div>
          <div
            className={`admin-attention ${backupNeedsAttention ? "attention" : ""}`}
          >
            {backupNeedsAttention ? (
              <AlertTriangle size={19} />
            ) : (
              <CheckCircle2 size={19} />
            )}
            <div>
              <strong>
                {backupAge === null
                  ? "Create your first backup"
                  : backupAge >= 1
                    ? `Latest backup is ${backupAge} day${backupAge === 1 ? "" : "s"} old`
                    : "Recent backup recorded"}
              </strong>
              <p>
                Daily backup review is recommended. A recorded backup is not a
                restore test.
              </p>
            </div>
          </div>
          <button onClick={() => navigate("Backup Restore")}>
            Open backup & recovery <ArrowUpRight size={15} />
          </button>
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Recent administrative activity</h2>
              <p>Latest 6 security and system events</p>
            </div>
          </div>
          {d.recent.length ? (
            d.recent.map((e: any) => (
              <div className="admin-event" key={e.id}>
                <span className={`audit-outcome ${e.outcome.toLowerCase()}`}>
                  {e.outcome === "SUCCESS"
                    ? "Success"
                    : e.outcome === "DENIED"
                      ? "Denied"
                      : "Failed"}
                </span>
                <div>
                  <strong>{events[e.action] || e.action}</strong>
                  <small>
                    {e.actor || "Unauthenticated"} · {stamp(e.created_at)}
                  </small>
                </div>
              </div>
            ))
          ) : (
            <p>No administrative events recorded yet.</p>
          )}
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Access & system status</h2>
              <p>Active accounts by role</p>
            </div>
          </div>
          <div className="admin-role-list">
            {d.roles.map((r: any) => (
              <div key={r.role}>
                <span>{r.role}</span>
                <strong>{r.users}</strong>
              </div>
            ))}
          </div>
          <p className="admin-note">
            Users with multiple roles are counted in each role.
          </p>
          <div className="admin-system-row">
            <span>Database</span>
            <strong>Connected</strong>
          </div>
          <div className="admin-system-row">
            <span>API uptime</span>
            <strong>{uptime}</strong>
          </div>
        </section>
      </div>
      <section className="panel admin-shortcuts">
        <h2>Quick actions</h2>
        {[
          ["User Management", Users],
          ["Security Audit", ShieldCheck],
          ["Backup Restore", Database],
          ["System Settings", Settings],
        ].map(([label, Icon]: any) => (
          <button key={label} onClick={() => navigate(label)}>
            <Icon size={18} />
            {label}
            <ArrowUpRight size={15} />
          </button>
        ))}
      </section>
      <p className="admin-note">
        Snapshot checked {stamp(d.checkedAt)} · Philippine time. Use Refresh
        data to update. Active sessions do not necessarily mean users are
        currently online.
      </p>
    </div>
  );
}

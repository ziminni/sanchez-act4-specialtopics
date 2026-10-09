import {
  ChevronRight,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../api/client";
import { useApp } from "../../app/AppContext";

type User = {
  id: number;
  name: string;
  username: string;
  roles: string[];
  active: boolean;
  last_sign_in: string | null;
  active_sessions: number;
};
const descriptions: Record<string, string> = {
  Owner: "Full business and system access.",
  Administrator:
    "System dashboard, user management, security audit, backup and system settings.",
  Cashier: "Subscriber lookup, payment collection and report viewing.",
  "Collection Supervisor": "Collection batches, reconciliation and reports.",
  Auditor: "Financial audit, reports and payment reversal.",
  Technician: "Service records and reconnection completion.",
  Viewer: "Read-only reports.",
};
const time = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("en-PH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Manila",
      }).format(new Date(v))
    : "No sign-in recorded";
export function UserManagement({
  rows,
  currentUser,
  request,
  reload,
}: {
  rows: User[];
  currentUser: any;
  request: (url: string, body?: unknown) => Promise<any>;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [role, setRole] = useState(""),
    [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const [selected, setSelected] = useState<User | null>(null),
    [confirm, setConfirm] = useState(false),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const admin = currentUser.roles.includes("Administrator");
  const filtered = rows.filter(
    (r) =>
      (!search ||
        `${r.name} ${r.username} ${r.id}`
          .toLowerCase()
          .includes(search.toLowerCase().trim())) &&
      (!role || r.roles.includes(role)) &&
      (!status || (status === "active") === r.active),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / 10)),
    currentPage = Math.min(page, pages),
    visible = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const protectedUser =
    selected &&
    (selected.id === currentUser.id ||
      (admin && selected.roles.includes("Owner")));
  const close = () => {
    if (!busy) {
      setSelected(null);
      setConfirm(false);
      setError("");
      setReason("");
    }
  };
  return (
    <div className="user-management">
      <section className="audit-intro">
        <div className="audit-icon">
          <Users size={26} />
        </div>
        <div>
          <h2>Team directory</h2>
          <p>Manage staff access and review account activity.</p>
        </div>
        <span className="audit-readonly">
          <ShieldCheck size={14} /> Role-based access
        </span>
      </section>
      <div className="audit-metrics">
        {[
          ["Total accounts", rows.length],
          ["Active", rows.filter((r) => r.active).length],
          ["Inactive", rows.filter((r) => !r.active).length],
          [
            "With active sessions",
            rows.filter((r) => r.active_sessions > 0).length,
          ],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>All team accounts</small>
          </div>
        ))}
      </div>
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <section className="panel audit-panel">
        <div className="audit-toolbar">
          <div>
            <h3>User accounts</h3>
            <p className="admin-note">
              Last sign-in times are shown in Philippine time.
            </p>
          </div>
          <span className="admin-note">
            {filtered.length} matching accounts
          </span>
        </div>
        <div className="user-filters">
          <label>
            Search users
            <div className="user-search">
              <Search size={16} />
              <input
                aria-label="Search users"
                placeholder="Name, username or user ID"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </label>
          <label>
            Role
            <select
              aria-label="Filter by role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All roles</option>
              {Object.keys(descriptions).map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              aria-label="Filter by status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
          <button
            onClick={() => {
              setSearch("");
              setRole("");
              setStatus("");
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </div>
        <div className="audit-table-wrap">
          <table>
            <thead>
              <tr>
                {[
                  "Team member",
                  "Role",
                  "Status",
                  "Last sign-in · PHT",
                  "Sessions",
                  "Access",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td>
                    <div className="user-identity">
                      <span className="user-initials">
                        {r.name
                          .split(" ")
                          .slice(0, 2)
                          .map((n) => n[0])
                          .join("")}
                      </span>
                      <div>
                        <strong>
                          {r.name}
                          {r.id === currentUser.id && <em>You</em>}
                        </strong>
                        <small>
                          @{r.username} · ID {r.id}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    {r.roles.join(", ") || "No role assigned"}
                    {r.roles.includes("Owner") && (
                      <small>Owner-controlled access</small>
                    )}
                  </td>
                  <td>
                    <span
                      className={`audit-outcome ${r.active ? "success" : "inactive"}`}
                    >
                      {r.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td>{time(r.last_sign_in)}</td>
                  <td>{r.active_sessions}</td>
                  <td>
                    <button
                      aria-label={`Manage ${r.username}`}
                      onClick={() => {
                        setSelected(r);
                        setConfirm(false);
                        setError("");
                        setReason("");
                      }}
                    >
                      Manage <ChevronRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!visible.length && (
          <div className="audit-empty">
            <Users size={30} />
            <h3>No matching users</h3>
            <p>Try another name or clear the filters.</p>
          </div>
        )}
        <div className="audit-pagination">
          <span>
            {filtered.length
              ? `${(currentPage - 1) * 10 + 1}–${Math.min(currentPage * 10, filtered.length)}`
              : "0"}{" "}
            of {filtered.length} accounts
          </span>
          <div>
            <button
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              Previous
            </button>
            <span>
              Page {currentPage} of {pages}
            </span>
            <button
              disabled={currentPage === pages}
              onClick={() => setPage(currentPage + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <section className="panel user-role-guide">
        <h3>Role guide</h3>
        <div>
          {Object.entries(descriptions).map(([r, description]) => (
            <article key={r}>
              <strong>{r}</strong>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
      <p className="admin-note">
        Active sessions are unexpired logins, not proof that a user is online.
        Older accounts may have no recorded sign-in history.
      </p>
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal audit-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Manage user access"
            onKeyDown={(e) => {
              if (e.key === "Escape") close();
            }}
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">USER #{selected.id}</div>
                <h2>{selected.name}</h2>
                <p className="admin-note">@{selected.username}</p>
              </div>
              <button
                aria-label="Close user details"
                disabled={busy}
                onClick={close}
                autoFocus
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <dl>
              <dt>Role</dt>
              <dd>{selected.roles.join(", ")}</dd>
              <dt>Status</dt>
              <dd>{selected.active ? "Active" : "Inactive"}</dd>
              <dt>Last sign-in</dt>
              <dd>{time(selected.last_sign_in)}</dd>
              <dt>Active sessions</dt>
              <dd>{selected.active_sessions}</dd>
            </dl>
            {selected.roles.map((r) => (
              <p className="admin-note" key={r}>
                {descriptions[r]}
              </p>
            ))}
            {protectedUser ? (
              <div className="user-protection">
                <ShieldCheck size={18} />
                {selected.id === currentUser.id
                  ? "You cannot deactivate your own account."
                  : "Only an Owner can change this account’s access."}
              </div>
            ) : confirm ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setBusy(true);
                  setError("");
                  try {
                    await request(`/users/${selected.id}/active`, {
                      active: !selected.active,
                      reason,
                    });
                    await reload();
                    setNotice(
                      `${selected.name} ${selected.active ? "deactivated" : "activated"}. Access change recorded in Security Audit.`,
                    );
                    setSelected(null);
                    setConfirm(false);
                    setReason("");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <h3>
                  {selected.active ? "Deactivate" : "Activate"} this account?
                </h3>
                <p className="admin-note">
                  {selected.active
                    ? "This user will lose access immediately and their existing sessions will end. Their records and audit history will remain."
                    : "This user will be able to sign in with their assigned role."}
                </p>
                <label className="user-reason">
                  Reason for access change
                  <textarea
                    aria-label="Reason for access change"
                    required
                    minLength={5}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={selected.active ? "danger" : "primary"}
                    disabled={busy}
                  >
                    {busy
                      ? "Saving…"
                      : `Confirm ${selected.active ? "deactivation" : "activation"}`}
                  </button>
                </div>
              </form>
            ) : (
              <button
                className={selected.active ? "danger" : "primary"}
                onClick={() => setConfirm(true)}
              >
                {selected.active ? "Deactivate account" : "Activate account"}
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export function UserManagementPage() {
  const {
    user,
    setNotice,
    busy,
    lookups,
    setModal,
    systemAdmin,
    run,
    reload,
    rows,
  } = useApp();
  return (
    <>
      <>
        <UserManagement
          rows={rows}
          currentUser={user}
          request={api}
          reload={reload}
        />
        {!systemAdmin && (
          <div className="report-grid admin-cards">
            <section className="panel report-card">
              <ShieldCheck size={25} />
              <h2>Backup & recovery</h2>
              <p>
                Create a PostgreSQL archive and attachment snapshot. Restore is
                an offline, administrator-controlled maintenance operation.
              </p>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const b = await api("/backups", {});
                    setNotice(`Backup archive verified: ${b.name}`);
                  })
                }
              >
                Create backup
              </button>
            </section>
            <section className="panel report-card">
              <Settings size={25} />
              <h2>Service policy</h2>
              <p>Configure overdue grace and suspension thresholds.</p>
              <button onClick={() => setModal("settings")}>
                Configure policy
              </button>
            </section>
            <section className="panel report-card">
              <Wifi size={25} />
              <h2>Service plans</h2>
              <p>
                {lookups.plans.length} plans configured. Billed rates remain
                preserved in invoice history.
              </p>
              <button onClick={() => setModal("plans")}>Manage plans</button>
            </section>
          </div>
        )}
      </>
    </>
  );
}

export function UserManagementActions() {
  const { setModal } = useApp();
  return (
    <>
      <button className="primary" onClick={() => setModal("user")}>
        <Plus size={17} /> Add team member
      </button>
    </>
  );
}

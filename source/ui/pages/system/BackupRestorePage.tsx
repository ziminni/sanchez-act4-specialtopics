import {
  ArrowRight,
  CheckCircle2,
  Database,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../api/client";
import { useApp } from "../../app/AppContext";

const stamp = (v: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Manila",
  }).format(new Date(v));
const label = (r: any) =>
  r.verification_outcome === "FAILURE"
    ? "Needs attention"
    : r.verification_outcome === "SUCCESS"
      ? "Verified again"
      : "Checked at creation";
export function BackupRestore({
  rows,
  request,
  reload,
}: {
  rows: any[];
  request: (url: string, body?: unknown) => Promise<any>;
  reload: () => Promise<void>;
}) {
  const [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [guide, setGuide] = useState(false);
  const filtered = rows.filter(
    (r) =>
      (!search ||
        `${r.filename} ${r.created_by || ""} ${r.id}`
          .toLowerCase()
          .includes(search.toLowerCase().trim())) &&
      (!filter || label(r) === filter),
  );
  const run = async (task: string, fn: () => Promise<void>) => {
    setBusy(task);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  const verify = (r: any) =>
    run(`verify-${r.id}`, async () => {
      const result = await request(`/backups/${r.id}/verify`, {});
      await reload();
      setSelected({
        ...r,
        verified_at: result.checkedAt,
        verification_outcome: result.ok ? "SUCCESS" : "FAILURE",
        verification: result,
      });
      if (result.ok) setNotice(result.message);
      else setError(result.message);
    });
  return (
    <div className="backup-workspace">
      <section className="audit-intro">
        <div className="audit-icon">
          <Database size={26} />
        </div>
        <div>
          <h2>Backup & recovery center</h2>
          <p>Protect system records and prepare a controlled recovery.</p>
        </div>
        <span className="audit-readonly">Server-managed storage</span>
      </section>
      <div className="audit-metrics">
        {[
          ["Recorded backups", rows.length],
          [
            "Verified again",
            rows.filter((r) => r.verification_outcome === "SUCCESS").length,
          ],
          [
            "Needs attention",
            rows.filter((r) => r.verification_outcome === "FAILURE").length,
          ],
          [
            "Latest backup",
            rows[0] ? stamp(rows[0].created_at) : "Not yet created",
          ],
        ].map(([k, v]) => (
          <div className="panel" key={k}>
            <span>{k}</span>
            <strong className={k === "Latest backup" ? "backup-date" : ""}>
              {v}
            </strong>
            <small>Latest {rows.length} records · up to 30</small>
          </div>
        ))}
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <div className="backup-actions-grid">
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Create a recovery copy</h2>
              <p>Database archive, attachments and checksum manifest</p>
            </div>
            <Database size={23} />
          </div>
          <p className="backup-copy">
            Create a manual backup on the central server. Wait for completion
            before closing this page.
          </p>
          <button
            className="primary"
            disabled={!!busy}
            onClick={() =>
              run("create", async () => {
                const b = await request("/backups", {});
                await reload();
                setNotice(`Backup created: ${b.name}`);
              })
            }
          >
            {busy === "create" ? "Creating backup…" : "Create backup"}
          </button>
          <p className="admin-note">
            A backup stored on this server is not an off-site copy.
          </p>
        </section>
        <section className="panel admin-section">
          <div className="admin-section-title">
            <div>
              <h2>Restore with a recovery plan</h2>
              <p>Offline restoration into an empty target database</p>
            </div>
            <ShieldCheck size={23} />
          </div>
          <p className="backup-copy">
            Choose a backup below to verify its files and review recovery steps.
            Restoration is performed on the server, not in this browser.
          </p>
          <button
            onClick={() => {
              setSelected(null);
              setGuide(true);
            }}
            disabled={!!busy}
          >
            View restore guide <ArrowRight size={15} />
          </button>
          <p className="admin-note">
            The recovery script refuses to overwrite an existing database.
          </p>
        </section>
      </div>
      <section className="panel audit-panel">
        <div className="audit-toolbar">
          <div>
            <h3>Backup history</h3>
            <p className="admin-note">Philippine time · latest 30 records</p>
          </div>
          <button disabled={!!busy} onClick={() => run("refresh", reload)}>
            <RefreshCw size={15} />
            Refresh
          </button>
        </div>
        <div className="backup-filters">
          <label>
            Search backups
            <div className="user-search">
              <Search size={16} />
              <input
                aria-label="Search backups"
                placeholder="Backup name, creator or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </label>
          <label>
            Verification
            <select
              aria-label="Verification status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              {["Checked at creation", "Verified again", "Needs attention"].map(
                (s) => (
                  <option key={s}>{s}</option>
                ),
              )}
            </select>
          </label>
          <button
            onClick={() => {
              setSearch("");
              setFilter("");
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
                  "Backup",
                  "Created · PHT",
                  "Created by",
                  "Verification",
                  "Actions",
                ].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>Backup #{r.id}</strong>
                    <small className="backup-filename">{r.filename}</small>
                  </td>
                  <td>{stamp(r.created_at)}</td>
                  <td>{r.created_by || "Unknown"}</td>
                  <td>
                    <span
                      className={`audit-outcome ${r.verification_outcome === "FAILURE" ? "failure" : r.verification_outcome === "SUCCESS" ? "success" : "inactive"}`}
                    >
                      {label(r)}
                    </span>
                    <small>
                      {r.verified_at
                        ? stamp(r.verified_at)
                        : "No subsequent check recorded"}
                    </small>
                  </td>
                  <td>
                    <button
                      aria-label={`View backup ${r.id}`}
                      disabled={!!busy}
                      onClick={() => {
                        setSelected(r);
                        setGuide(false);
                      }}
                    >
                      Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <div className="audit-empty">
            <Database size={30} />
            <h3>
              {rows.length ? "No matching backups" : "No backups recorded"}
            </h3>
            <p>
              {rows.length
                ? "Clear filters or try a different search."
                : "Create your first backup to establish a recovery copy."}
            </p>
          </div>
        )}
        <div className="audit-pagination">
          <span>
            {filtered.length} of {rows.length} loaded backups
          </span>
          <span>Read-only history</span>
        </div>
      </section>
      <p className="admin-note">
        Verification checks files and archive readability. A successful restore
        drill is a separate test. Keep a protected copy outside this server.
      </p>
      {(selected || guide) && (
        <div className="modal-backdrop">
          <section
            className="modal audit-detail backup-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Backup details and recovery"
            onKeyDown={(e) => {
              if (e.key === "Escape" && !busy) {
                setSelected(null);
                setGuide(false);
              }
            }}
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">RECOVERY WORKSPACE</div>
                <h2>{selected ? `Backup #${selected.id}` : "Restore guide"}</h2>
              </div>
              <button
                autoFocus
                aria-label="Close backup details"
                disabled={!!busy}
                onClick={() => {
                  setSelected(null);
                  setGuide(false);
                }}
              >
                <X size={20} />
              </button>
            </div>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {selected && (
              <>
                <dl>
                  <dt>Backup name</dt>
                  <dd>{selected.filename}</dd>
                  <dt>Created</dt>
                  <dd>{stamp(selected.created_at)}</dd>
                  <dt>Created by</dt>
                  <dd>{selected.created_by || "Unknown"}</dd>
                  <dt>Verification</dt>
                  <dd>{label(selected)}</dd>
                  <dt>Database SHA-256</dt>
                  <dd className="audit-mono">{selected.sha256}</dd>
                  {selected.verification?.ok && (
                    <>
                      <dt>Verified size</dt>
                      <dd>
                        {(selected.verification.bytes / 1048576).toFixed(2)} MB
                      </dd>
                      <dt>Attachments</dt>
                      <dd>{selected.verification.attachments}</dd>
                    </>
                  )}
                </dl>
                <button disabled={!!busy} onClick={() => verify(selected)}>
                  <CheckCircle2 size={16} />
                  {busy.startsWith("verify")
                    ? "Verifying files…"
                    : "Verify backup now"}
                </button>
                {selected.verification?.message && (
                  <p className="backup-copy">{selected.verification.message}</p>
                )}
              </>
            )}
            <h3 className="backup-guide-title">Restore procedure</h3>
            <ol className="backup-steps">
              <li>
                <strong>Verify the recovery copy</strong>
                <p>
                  Check the database archive, attachments and checksums. Resolve
                  failed checks before continuing.
                </p>
              </li>
              <li>
                <strong>Prepare a maintenance window</strong>
                <p>
                  Stop the API and arrange an empty target database and a new
                  empty attachment directory.
                </p>
              </li>
              <li>
                <strong>Run the server recovery script</strong>
                <p>
                  From the project folder, supply the selected backup directory
                  and the new target locations.
                </p>
              </li>
              <li>
                <strong>Review and switch over</strong>
                <p>
                  After successful restoration, review the data, update the
                  stopped API’s database and storage configuration, then
                  restart. Restored sessions are invalidated.
                </p>
              </li>
            </ol>
            <div className="backup-command">
              <span>Command template · replace the placeholders</span>
              <code>
                npm run restore -- &lt;backup-directory&gt;
                &lt;empty-target-database-url&gt;
                &lt;new-attachment-directory&gt;
              </code>
            </div>
            <p className="admin-note">
              This guide does not start a restore. The script validates
              checksums and refuses nonempty targets.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

export function BackupRestorePage() {
  const { reload, rows } = useApp();
  return (
    <>
      <BackupRestore rows={rows} request={api} reload={reload} />
    </>
  );
}

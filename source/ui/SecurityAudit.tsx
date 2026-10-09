import React, { useEffect, useState } from "react";
import {
  ShieldCheck,
  Search,
  RefreshCw,
  X,
  ChevronRight,
  Download,
} from "lucide-react";
type Event = {
  id: string;
  created_at: string;
  actor: string | null;
  username: string | null;
  action: string;
  entity: string;
  entity_id: string;
  reason: string;
  outcome: string;
  source_ip: string | null;
  request_id: string | null;
  details: Record<string, unknown>;
};
type Result = {
  rows: Event[];
  summary: { total: number; success: number; failure: number; denied: number };
  page: number;
  pageSize: number;
};
const labels: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.login_failed": "Sign-in failed",
  "auth.access_denied": "Access denied",
  "user.create": "User account created",
  "user.status": "User access updated",
  "backup.create": "Backup created",
  "system.settings.update": "System settings updated",
};
const timestamp = (value: string) =>
  new Intl.DateTimeFormat("en-PH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
const category = (action: string) =>
  ({
    auth: "Authentication",
    user: "User management",
    backup: "Backup & recovery",
    system: "System settings",
  })[action.split(".")[0]] || "Security";
export function SecurityAudit({
  request,
}: {
  request: (url: string) => Promise<any>;
}) {
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    outcome: "",
    from: "",
    to: "",
  });
  const [page, setPage] = useState(1),
    [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<Result | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<Event | null>(null);
  const [updated, setUpdated] = useState("");
  const invalid = !!(filters.from && filters.to && filters.from > filters.to);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    if (invalid) {
      setError("Start date must be on or before end date.");
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      const query = new URLSearchParams({ page: String(page) });
      Object.entries(filters).forEach(([k, v]) => {
        if (v) query.set(k, v);
      });
      request(`/security-audit?${query}`)
        .then((r) => {
          if (!cancelled) {
            setResult(r);
            setUpdated(new Date().toISOString());
          }
        })
        .catch((e) => {
          if (!cancelled) setError(e.message);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filters, page, refresh, request, invalid]);
  const change = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  const exportPage = () => {
    if (!result) return;
    const cell = (v: unknown) =>
      '"' +
      String(v ?? "")
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const records = [
      [
        "Event ID",
        "Time (Asia/Manila)",
        "Actor",
        "Event",
        "Outcome",
        "Source IP",
        "Record",
      ],
      ...result.rows.map((e) => [
        e.id,
        timestamp(e.created_at),
        e.actor || e.details.username || "Unauthenticated",
        labels[e.action] || e.action,
        e.outcome,
        e.source_ip || "Not recorded",
        `${e.entity} ${e.entity_id}`,
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + records.map((r) => r.map(cell).join(",")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `security-audit-page-${page}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="security-audit">
      <section className="audit-intro">
        <div className="audit-icon">
          <ShieldCheck size={26} />
        </div>
        <div>
          <h2>Security activity</h2>
          <p>
            Trace account access and administrative changes. All times are
            Philippine time (UTC+08:00).
          </p>
        </div>
        <span className="audit-readonly">Read-only log</span>
      </section>
      <div className="audit-metrics" aria-label="Filtered event summary">
        {[
          ["Matching events", result?.summary.total],
          ["Successful", result?.summary.success],
          ["Failed", result?.summary.failure],
          ["Access denied", result?.summary.denied],
        ].map(([label, value]) => (
          <div className="panel" key={label}>
            <span>{label}</span>
            <strong>
              {loading || error ? "—" : Number(value ?? 0).toLocaleString()}
            </strong>
            <small>Current filters</small>
          </div>
        ))}
      </div>
      <section className="panel audit-panel">
        <div className="audit-toolbar">
          <h3>Event history</h3>
          <div>
            <button onClick={() => setRefresh((r) => r + 1)} disabled={loading}>
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              onClick={exportPage}
              disabled={loading || !!error || !result?.rows.length}
            >
              <Download size={15} />
              Export this page
            </button>
          </div>
        </div>
        <div className="audit-filters">
          <label className="audit-search">
            Search events
            <div>
              <Search size={16} />
              <input
                aria-label="Search events"
                value={filters.search}
                maxLength={100}
                placeholder="User, event, IP address or ID"
                onChange={(e) => change("search", e.target.value)}
              />
            </div>
          </label>
          <label>
            Category
            <select
              aria-label="Category"
              value={filters.category}
              onChange={(e) => change("category", e.target.value)}
            >
              <option value="">All categories</option>
              <option value="auth">Authentication</option>
              <option value="user">User management</option>
              <option value="backup">Backup & recovery</option>
              <option value="system">System settings</option>
            </select>
          </label>
          <label>
            Outcome
            <select
              aria-label="Outcome"
              value={filters.outcome}
              onChange={(e) => change("outcome", e.target.value)}
            >
              <option value="">All outcomes</option>
              <option value="SUCCESS">Successful</option>
              <option value="FAILURE">Failed</option>
              <option value="DENIED">Denied</option>
            </select>
          </label>
          <label>
            From
            <input
              type="date"
              aria-label="From"
              value={filters.from}
              onChange={(e) => change("from", e.target.value)}
            />
          </label>
          <label>
            To
            <input
              type="date"
              aria-label="To"
              value={filters.to}
              onChange={(e) => change("to", e.target.value)}
            />
          </label>
          <button
            onClick={() => {
              setFilters({
                search: "",
                category: "",
                outcome: "",
                from: "",
                to: "",
              });
              setPage(1);
            }}
          >
            Clear filters
          </button>
        </div>
        <div aria-live="polite">
          {error ? (
            <div className="error">{error}</div>
          ) : loading ? (
            <div className="audit-empty">Loading security events…</div>
          ) : !result?.rows.length ? (
            <div className="audit-empty">
              <ShieldCheck size={30} />
              <h3>No matching events</h3>
              <p>Try a different search or clear your filters.</p>
            </div>
          ) : (
            <div className="audit-table-wrap">
              <table>
                <thead>
                  <tr>
                    {[
                      "Time · PHT",
                      "User",
                      "Event",
                      "Outcome",
                      "Source IP",
                      "Details",
                    ].map((h) => (
                      <th key={h}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {timestamp(e.created_at)}
                        <small>Event #{e.id}</small>
                      </td>
                      <td>
                        <strong>
                          {e.actor ||
                            String(e.details.username || "Unauthenticated")}
                        </strong>
                        <small>
                          {e.username ||
                            (e.actor ? "" : "Identity not verified")}
                        </small>
                      </td>
                      <td>
                        {labels[e.action] || e.action}
                        <small>{category(e.action)}</small>
                      </td>
                      <td>
                        <span
                          className={`audit-outcome ${e.outcome.toLowerCase()}`}
                        >
                          {
                            (
                              {
                                SUCCESS: "Successful",
                                FAILURE: "Failed",
                                DENIED: "Denied",
                              } as Record<string, string>
                            )[e.outcome]
                          }
                        </span>
                      </td>
                      <td className="audit-mono">
                        {e.source_ip || "Not recorded"}
                      </td>
                      <td>
                        <button
                          aria-label={`View event ${e.id}`}
                          onClick={() => setSelected(e)}
                        >
                          View
                          <ChevronRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="audit-pagination">
          <span>
            {!loading && !error && result
              ? `${result.summary.total ? (page - 1) * 25 + 1 : 0}–${Math.min(page * 25, result.summary.total)} of ${result.summary.total} events`
              : "Event history"}
          </span>
          <div>
            <button
              disabled={loading || page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>Page {page}</span>
            <button
              disabled={
                loading ||
                !!error ||
                !result ||
                page * 25 >= result.summary.total
              }
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </section>
      <p className="audit-footnote">
        {updated ? `Last refreshed ${timestamp(updated)}. ` : ""}Source
        addresses are recorded for new authentication events. Older entries may
        not include this information.
      </p>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section
            className="modal audit-detail"
            role="dialog"
            aria-modal="true"
            aria-label="Security event details"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === "Escape") setSelected(null);
            }}
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">EVENT #{selected.id}</div>
                <h2>{labels[selected.action] || selected.action}</h2>
              </div>
              <button
                autoFocus
                aria-label="Close event details"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </div>
            <dl>
              {Object.entries({
                "Time (Philippine time)": timestamp(selected.created_at),
                User: selected.actor || "Unauthenticated",
                "Event code": selected.action,
                Outcome: selected.outcome,
                Record: `${selected.entity} · ${selected.entity_id}`,
                "Source IP": selected.source_ip || "Not recorded",
                "Request ID": selected.request_id || "Not recorded",
                ...(selected.reason ? { Reason: selected.reason } : {}),
              }).map(([k, v]) => (
                <React.Fragment key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </React.Fragment>
              ))}
            </dl>
            {Object.keys(selected.details).length > 0 && (
              <>
                <h3>Recorded details</h3>
                <dl>
                  {Object.entries(selected.details).map(([k, v]) => (
                    <React.Fragment key={k}>
                      <dt>{k}</dt>
                      <dd>{String(v)}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </>
            )}
            <p className="audit-footnote">
              Audit entries cannot be edited or deleted from this workspace.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}

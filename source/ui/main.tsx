import React, { useState, useEffect, useCallback, useId } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Users,
  FileText,
  CreditCard,
  Truck,
  ChartNoAxesCombined,
  Settings,
  Search,
  Bell,
  ChevronRight,
  Plus,
  Download,
  ArrowUpRight,
  Wifi,
  LogOut,
  ShieldCheck,
  Check,
  Printer,
  RefreshCw,
  X,
  Wallet,
  Activity,
  Menu,
} from "lucide-react";
import { money, centavos, allocate } from "../shared/domain";
import "./style.css";
import type { DesktopBridge } from "../shared/bridge";
type Row = Record<string, any>;
declare global {
  interface Window {
    bcis?: DesktopBridge;
  }
}
let sessionToken = "";
async function api(url: string, body?: unknown) {
  const method = body === undefined ? "GET" : "POST";
  let status: number, data: any;
  if (window.bcis) {
    const r = await window.bcis.request({
      path: "/api" + url,
      method,
      token: sessionToken,
      body,
    });
    status = r.status;
    data = r.body;
  } else {
    const r = await fetch("/api" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = r.status;
    data = await r.json();
  }
  if (status >= 400) throw new Error(data.error || "Request failed");
  return data;
}
async function binaryApi(url: string): Promise<Blob> {
  if (window.bcis) {
    const r = await window.bcis.request({
      path: "/api" + url,
      method: "GET",
      token: sessionToken,
      binary: true,
    });
    if (r.status >= 400) throw new Error(r.body.error);
    return new Blob([Uint8Array.from(atob(r.body), (c) => c.charCodeAt(0))], {
      type: r.mime,
    });
  }
  const r = await fetch("/api" + url, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.blob();
}
async function uploadProof(id: number, file: File) {
  if (window.bcis) {
    const r = await window.bcis.request({
      path: `/api/proofs/${id}/upload`,
      method: "POST",
      token: sessionToken,
      upload: {
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        name: file.name,
        type: file.type,
      },
    });
    if (r.status >= 400) throw new Error(r.body.error);
    return;
  }
  const body = new FormData();
  body.append("file", file);
  const r = await fetch(`/api/proofs/${id}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    body,
  });
  if (!r.ok) throw new Error((await r.json()).error);
}
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const date = (v: any) =>
  v
    ? new Date(v).toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
function Badge({ value }: { value: any }) {
  return (
    <span
      className={"badge " + String(value).toLowerCase().replaceAll("_", "-")}
    >
      {String(value ?? "—").replaceAll("_", " ")}
    </span>
  );
}
function Table({
  rows,
  columns,
  onRow,
}: {
  rows: Row[];
  columns: [string, string, ((r: Row) => React.ReactNode)?][];
  onRow?: (r: Row) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([k, label]) => (
              <th
                key={k}
                className={
                  /amount|balance|total|outstanding|cash|difference/.test(k)
                    ? "numeric"
                    : ""
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id ?? i}
              onClick={() => onRow?.(r)}
              className={onRow ? "clickable" : ""}
            >
              {columns.map(([k, , render]) => (
                <td
                  key={k}
                  className={
                    /amount|balance|total|outstanding|cash|difference/.test(k)
                      ? "numeric"
                      : ""
                  }
                >
                  {render ? render(r) : String(r[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <FileText size={28} />
          <h3>No records to display</h3>
          <p>Records will appear here as your team works.</p>
        </div>
      )}
    </div>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function App() {
  const [user, setUser] = useState<Row | null>(null),
    [page, setPage] = useState("Dashboard"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [data, setData] = useState<any>(null),
    [lookups, setLookups] = useState<Row>({
      plans: [],
      areas: [],
      collectors: [],
    }),
    [search, setSearch] = useState(""),
    [pageNo, setPageNo] = useState(1),
    [modal, setModal] = useState(""),
    [profile, setProfile] = useState<Row | null>(null),
    [tab, setTab] = useState("Overview"),
    [selected, setSelected] = useState<Row | null>(null),
    [proofUrl, setProofUrl] = useState(""),
    [from, setFrom] = useState(today().slice(0, 7) + "-01"),
    [to, setTo] = useState(today()),
    [area, setArea] = useState(""),
    [collector, setCollector] = useState(""),
    [serviceView, setServiceView] = useState("accounts"),
    [arDays, setArDays] = useState("0"),
    [arPlan, setArPlan] = useState(""),
    [arType, setArType] = useState("");
  const can = (p: string) =>
    user?.permissions?.includes("*") || user?.permissions?.includes(p);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const routes: Record<string, string> = {
    Dashboard: "/dashboard",
    Subscribers: `/subscribers?search=${encodeURIComponent(search)}&page=${pageNo}${area ? "&area=" + area : ""}`,
    Billing: `/invoices?page=${pageNo}&search=${encodeURIComponent(search)}`,
    Payments: `/payments?page=${pageNo}`,
    "GCash Verification": "/proofs",
    Collections: "/batches",
    Receivables: `/receivables?minDays=${arDays}${arPlan ? "&plan=" + arPlan : ""}${arType ? "&type=" + arType : ""}&page=${pageNo}${area ? "&area=" + area : ""}${collector ? "&collector=" + collector : ""}`,
    Services:
      serviceView === "reconnections"
        ? "/reconnections"
        : serviceView === "candidates"
          ? "/suspension-candidates"
          : `/services?page=${pageNo}`,
    Administration: "/users",
    "Audit Trail": `/audit?page=${pageNo}`,
    Reports: "/dashboard",
  };
  const reload = useCallback(async () => {
    const d = await api(routes[page]);
    setData(d);
  }, [
    page,
    search,
    pageNo,
    area,
    collector,
    serviceView,
    arDays,
    arPlan,
    arType,
  ]);
  useEffect(() => {
    if (user) {
      let cancelled = false;
      setData(null);
      const timer = setTimeout(() => {
        api(routes[page])
          .then((result) => {
            if (!cancelled) setData(result);
          })
          .catch((e) => {
            if (!cancelled) setError(e.message);
          });
      }, 150);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }
  }, [user, reload]);
  useEffect(() => {
    if (user)
      api("/lookups")
        .then(setLookups)
        .catch((e) => setError(e.message));
  }, [user, modal]);
  useEffect(() => {
    let url = "";
    if (selected?.path && page === "GCash Verification") {
      binaryApi(`/proofs/${selected.id}/image`)
        .then((b) => {
          url = URL.createObjectURL(b);
          setProofUrl(url);
        })
        .catch((e) => setError(e.message));
    } else setProofUrl("");
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [selected, page]);
  const navigate = (p: string) => {
    setData(null);
    setPage(p);
    setSearch("");
    setPageNo(1);
    setArea("");
    setCollector("");
    setSelected(null);
    setError("");
  };
  const openProfile = async (r: Row) =>
    run(async () => {
      setProfile(await api("/subscribers/" + r.id));
      setTab("Overview");
      setModal("profile");
    });
  const submit = async (
    e: React.FormEvent<HTMLFormElement>,
    fn: (b: Row) => Promise<void>,
  ) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.currentTarget));
    await run(() => fn(b));
  };
  const done = async (message: string) => {
    setNotice(message);
    setModal("");
    await reload();
  };
  const download = async (
    type: string,
    format: string,
    subscriberId?: number,
  ) =>
    run(async () => {
      if (window.bcis) {
        const result = await window.bcis.saveReport({
          path: `/api/reports/${type}?format=${format}&from=${from}&to=${to}${subscriberId ? "&subscriberId=" + subscriberId : ""}`,
          token: sessionToken,
        });
        if (result.saved) setNotice("Report saved.");
        return;
      }
      const blob = await binaryApi(
        `/reports/${type}?format=${format}&from=${from}&to=${to}${subscriberId ? "&subscriberId=" + subscriberId : ""}`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bcis-${type}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  if (!user)
    return (
      <div className="login">
        <div className="login-brand">
          <div className="brand-mark">
            <Wifi size={26} />
          </div>
          <h1>
            BCIS<span>Billing & Collections</span>
          </h1>
          <p>
            A clear view of every account.
            <br />
            Confidence in every collection.
          </p>
          <div className="login-foot">BUKIDNON CABLE AND INTERNET SERVICES</div>
        </div>
        <div className="login-form">
          <div className="eyebrow">YOUR OPERATIONS, CONNECTED</div>
          <h2>Welcome back</h2>
          <p>Sign in to your BCIS workspace.</p>
          <form
            onSubmit={(e) =>
              submit(e, async (b) => {
                const r = await api("/login", b);
                sessionToken = r.token;
                const me = await api("/me");
                setUser(me);
                if (
                  !me.permissions.includes("*") &&
                  !me.permissions.includes("report.view")
                )
                  setPage("Services");
              })
            }
          >
            <Field label="Username">
              <input
                name="username"
                required
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            {error && <div className="error">{error}</div>}
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="secure">
            <ShieldCheck size={15} /> Secure, role-based access · BCIS LAN
          </p>
        </div>
      </div>
    );
  const nav: [string, any, string, string][] = [
    ["Dashboard", LayoutDashboard, "report.view", "WORKSPACE"],
    ["Subscribers", Users, "subscriber.view", ""],
    ["Billing", FileText, "subscriber.view", ""],
    ["Payments", CreditCard, "subscriber.view", ""],
    ["GCash Verification", ShieldCheck, "payment.verify", ""],
    ["Collections", Truck, "collection.view", ""],
    ["Receivables", ChartNoAxesCombined, "report.view", ""],
    ["Services", Wifi, "service.view", ""],
    ["Reports", ChartNoAxesCombined, "report.view", "MANAGEMENT"],
    ["Administration", Settings, "user.manage", ""],
    ["Audit Trail", Activity, "audit.view", ""],
  ];
  const rows = Array.isArray(data) ? data : data?.rows || [];
  return (
    <div className="app">
      <aside>
        <div className="brand">
          <div className="brand-mark">
            <Wifi size={24} />
          </div>
          <div>
            BCIS<small>Billing & Collections</small>
          </div>
        </div>
        <div className="workspace">
          <span className="live-dot" /> Main office <span>LAN</span>
        </div>
        <nav>
          {nav
            .filter((n) => can(n[2]))
            .map(([label, Icon, , section]) => (
              <React.Fragment key={label}>
                {section && <div className="nav-label">{section}</div>}
                <button
                  aria-label={label}
                  className={page === label ? "active" : ""}
                  onClick={() => navigate(label)}
                >
                  <Icon size={18} />
                  {label}
                  {label === "GCash Verification" && (
                    <span className="nav-tag">Review</span>
                  )}
                </button>
              </React.Fragment>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="live-dot" /> Central API connection
          <small>All amounts in Philippine peso</small>
        </div>
        <div className="user">
          <div className="avatar">{user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            {user.name}
            <small>{user.roles.join(", ")}</small>
          </div>
          <button
            title="Lock and sign out"
            onClick={() =>
              run(async () => {
                await api("/logout", {});
                sessionToken = "";
                setUser(null);
                setData(null);
              })
            }
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </div>
          <div className="header-right">
            <span>{date(today())}</span>
            <button title="Refresh data" onClick={() => run(reload)}>
              <RefreshCw size={17} />
            </button>
            <span className="avatar small">
              {user.name.slice(0, 2).toUpperCase()}
            </span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">BCIS OPERATIONS</div>
              <h1>{page === "Dashboard" ? "Overview" : page}</h1>
              <p>
                {
                  (
                    {
                      Dashboard:
                        "Your billing and collection performance, at a glance.",
                      Subscribers:
                        "Manage subscriber relationships and service accounts.",
                      Billing:
                        "Consistent monthly billing. A complete financial history.",
                      Payments: "Receive, track, and reconcile every payment.",
                      "GCash Verification":
                        "Review payment evidence before posting to the ledger.",
                      Collections:
                        "From assigned routes to accountable remittances.",
                      Receivables:
                        "Stay ahead of outstanding balances and overdue accounts.",
                      Services:
                        "Manage service status and reconnection requests.",
                      Reports:
                        "Reliable reports for better operational decisions.",
                      Administration: "Manage your team, access, and recovery.",
                      "Audit Trail":
                        "An immutable record of operational and financial activity.",
                    } as Row
                  )[page]
                }
              </p>
            </div>
            <div className="actions">
              {page === "Dashboard" && can("payment.create") && (
                <button className="primary" onClick={() => setModal("payment")}>
                  <Plus size={17} /> Receive payment
                </button>
              )}
              {page === "Subscribers" && can("subscriber.edit") && (
                <button
                  className="primary"
                  onClick={() => setModal("subscriber")}
                >
                  <Plus size={17} /> New subscriber
                </button>
              )}
              {page === "Billing" && can("billing.generate") && (
                <button className="primary" onClick={() => setModal("billing")}>
                  <Plus size={17} /> Generate billing
                </button>
              )}
              {page === "Payments" && can("payment.create") && (
                <>
                  <button onClick={() => setModal("proof")}>
                    Record GCash proof
                  </button>
                  <button
                    className="primary"
                    onClick={() => setModal("payment")}
                  >
                    <Plus size={17} /> Receive payment
                  </button>
                </>
              )}
              {page === "Collections" && can("collection.manage") && (
                <button className="primary" onClick={() => setModal("batch")}>
                  <Plus size={17} /> New batch
                </button>
              )}
              {page === "Administration" && (
                <button className="primary" onClick={() => setModal("user")}>
                  <Plus size={17} /> Add team member
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error banner" role="alert">
              {error}
              <button onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="success banner" role="status">
              <Check size={17} />
              {notice}
              <button onClick={() => setNotice("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <div className="loading">Connecting to your workspace…</div>
          ) : (
            <>
              {page === "Dashboard" && (
                <>
                  <div className="kpis">
                    {[
                      [
                        "Outstanding receivable",
                        money(data.kpis.receivable),
                        "Across all billed accounts",
                        Wallet,
                      ],
                      [
                        "Collected this month",
                        money(data.kpis.collected),
                        "Posted, non-reversed payments",
                        CreditCard,
                      ],
                      [
                        "Overdue balance",
                        money(data.kpis.overdue),
                        `${data.kpis.overdue_accounts} accounts need attention`,
                        Activity,
                      ],
                      [
                        "Active subscribers",
                        Number(data.kpis.subscribers).toLocaleString(),
                        "Connected to BCIS",
                        Users,
                      ],
                    ].map(([label, value, sub, Icon]: any, i) => (
                      <div className="kpi" key={label}>
                        <div>
                          {label}
                          <Icon size={18} />
                        </div>
                        <strong>{value}</strong>
                        <small className={i === 2 ? "amber" : ""}>{sub}</small>
                      </div>
                    ))}
                  </div>
                  <div className="dashboard-grid">
                    <section className="panel trend">
                      <div className="panel-head">
                        <div>
                          <h2>Billing vs. collection</h2>
                          <p>Your last six months of activity</p>
                        </div>
                        <div className="legend">
                          <span>
                            <i />
                            Billed
                          </span>
                          <span>
                            <i className="light" />
                            Collected
                          </span>
                        </div>
                      </div>
                      <div className="chart">
                        {data.trend.map((r: Row) => {
                          const max = Math.max(
                            1,
                            ...data.trend.flatMap((t: Row) => [
                              Number(t.billed),
                              Number(t.collected),
                            ]),
                          );
                          return (
                            <div className="chart-group" key={r.month}>
                              <div className="bars">
                                <div
                                  title={money(r.billed)}
                                  style={{
                                    height: `${Math.max(1, (Number(r.billed) / max) * 100)}%`,
                                  }}
                                />
                                <div
                                  title={money(r.collected)}
                                  style={{
                                    height: `${Math.max(1, (Number(r.collected) / max) * 100)}%`,
                                  }}
                                />
                              </div>
                              <span>{r.month}</span>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>Payment methods</h2>
                          <p>Collections this month</p>
                        </div>
                        <CreditCard size={18} />
                      </div>
                      <div className="method-total">
                        {money(data.kpis.collected)}
                        <small>Total collected</small>
                      </div>
                      {data.methods.map((r: Row, i: number) => (
                        <div className="method" key={r.method}>
                          <div>
                            <span>
                              <i
                                style={{
                                  background: ["#2563eb", "#14b8a6", "#8b5cf6"][
                                    i % 3
                                  ],
                                }}
                              />
                              {r.method}
                            </span>
                            <strong>{money(r.total)}</strong>
                          </div>
                          <div className="progress">
                            <span
                              style={{
                                width: `${(Number(r.total) / Math.max(1, Number(data.kpis.collected))) * 100}%`,
                                background: ["#2563eb", "#14b8a6", "#8b5cf6"][
                                  i % 3
                                ],
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>Receivables aging</h2>
                          <p>Outstanding invoice balances</p>
                        </div>
                        <button
                          className="link"
                          onClick={() => navigate("Receivables")}
                        >
                          View accounts <ArrowUpRight size={15} />
                        </button>
                      </div>
                      <div className="aging">
                        {["Current", "1–30", "31–60", "61–90", "90+"].map(
                          (b, i) => {
                            const total =
                              data.aging.find((r: Row) => r.bucket === b)
                                ?.total || 0;
                            return (
                              <div key={b}>
                                <span>
                                  {b}
                                  {i > 0 ? " days" : ""}
                                </span>
                                <div className="progress">
                                  <span
                                    style={{
                                      width: `${Math.max(1, (Number(total) / Math.max(1, Number(data.kpis.receivable))) * 100)}%`,
                                      background: [
                                        "#2563eb",
                                        "#60a5fa",
                                        "#fbbf24",
                                        "#f59e0b",
                                        "#ef4444",
                                      ][i],
                                    }}
                                  />
                                </div>
                                <strong>{money(total)}</strong>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </section>
                    <section className="panel">
                      <div className="panel-head">
                        <div>
                          <h2>Needs attention</h2>
                          <p>Keep operations moving</p>
                        </div>
                        <Bell size={18} />
                      </div>
                      <button
                        className="alert-row"
                        onClick={() => navigate("Receivables")}
                      >
                        <span className="alert-icon">
                          <Activity size={18} />
                        </span>
                        <div>
                          <strong>
                            {data.kpis.overdue_accounts} overdue accounts
                          </strong>
                          <small>Review balances and follow up</small>
                        </div>
                        <ChevronRight size={17} />
                      </button>
                      {can("payment.verify") && (
                        <button
                          className="alert-row"
                          onClick={() => navigate("GCash Verification")}
                        >
                          <span className="alert-icon blue">
                            <ShieldCheck size={18} />
                          </span>
                          <div>
                            <strong>
                              {data.kpis.pending_proofs} GCash proofs pending
                            </strong>
                            <small>Verify before posting payments</small>
                          </div>
                          <ChevronRight size={17} />
                        </button>
                      )}
                      <div className="info-note">
                        <ShieldCheck size={16} /> Financial activity is recorded
                        in the audit trail.
                      </div>
                    </section>
                    <section className="panel recent">
                      <div className="panel-head">
                        <div>
                          <h2>Collector performance</h2>
                          <p>Posted field collections by assigned batch</p>
                        </div>
                      </div>
                      <Table
                        rows={data.collectors}
                        columns={[
                          ["name", "Collector"],
                          ["accounts", "Accounts collected"],
                          ["total", "Collected", (r) => money(r.total)],
                        ]}
                      />
                    </section>
                    <section className="panel recent">
                      <div className="panel-head">
                        <div>
                          <h2>Recent payments</h2>
                          <p>Latest posted collections</p>
                        </div>
                        {can("subscriber.view") && (
                          <button
                            className="link"
                            onClick={() => navigate("Payments")}
                          >
                            View all <ArrowUpRight size={15} />
                          </button>
                        )}
                      </div>
                      <Table
                        rows={data.recent}
                        columns={[
                          ["receipt_no", "Receipt"],
                          ["name", "Subscriber"],
                          [
                            "method",
                            "Method",
                            (r) => <Badge value={r.method} />,
                          ],
                          ["paid_at", "Date", (r) => date(r.paid_at)],
                          ["amount", "Amount", (r) => money(r.amount)],
                        ]}
                      />
                    </section>
                  </div>
                </>
              )}
              {[
                "Subscribers",
                "Billing",
                "Payments",
                "Receivables",
                "Services",
                "Audit Trail",
              ].includes(page) && (
                <section className="panel">
                  <div className="toolbar">
                    <div className="search">
                      <Search size={17} />
                      <input
                        placeholder={
                          page === "Subscribers"
                            ? "Search name, account, address, receipt…"
                            : "Search invoices or subscriber…"
                        }
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setPageNo(1);
                        }}
                        disabled={!["Subscribers", "Billing"].includes(page)}
                      />
                    </div>
                    <div className="actions">
                      {["Subscribers", "Receivables"].includes(page) && (
                        <select
                          value={area}
                          onChange={(e) => {
                            setArea(e.target.value);
                            setPageNo(1);
                          }}
                        >
                          <option value="">All areas</option>
                          {lookups.areas.map((a: Row) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {page === "Receivables" && (
                        <select
                          value={arDays}
                          onChange={(e) => {
                            setArDays(e.target.value);
                            setPageNo(1);
                          }}
                        >
                          <option value="0">All outstanding</option>
                          <option value="1">Overdue</option>
                          <option value="31">31+ days</option>
                          <option value="61">61+ days</option>
                          <option value="91">90+ days</option>
                        </select>
                      )}
                      {page === "Services" && (
                        <select
                          value={serviceView}
                          onChange={(e) => {
                            setServiceView(e.target.value);
                            setPageNo(1);
                          }}
                        >
                          <option value="accounts">Service accounts</option>
                          <option value="candidates">
                            Suspension candidates
                          </option>
                          <option value="reconnections">
                            Reconnection requests
                          </option>
                        </select>
                      )}
                      {page === "Receivables" && (
                        <select
                          value={collector}
                          onChange={(e) => setCollector(e.target.value)}
                        >
                          <option value="">All collectors</option>
                          {lookups.collectors.map((a: Row) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      )}
                      {page === "Receivables" && (
                        <>
                          <select
                            aria-label="Filter service type"
                            value={arType}
                            onChange={(e) => {
                              setArType(e.target.value);
                              setPageNo(1);
                            }}
                          >
                            <option value="">All service types</option>
                            {["Internet", "Cable", "Combo"].map((t) => (
                              <option key={t}>{t}</option>
                            ))}
                          </select>
                          <select
                            aria-label="Filter plan"
                            value={arPlan}
                            onChange={(e) => {
                              setArPlan(e.target.value);
                              setPageNo(1);
                            }}
                          >
                            <option value="">All plans</option>
                            {lookups.plans.map((p: Row) => (
                              <option value={p.id} key={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </>
                      )}
                      {can("report.export") &&
                        ["Subscribers", "Receivables"].includes(page) && (
                          <button
                            onClick={() =>
                              download(
                                page === "Subscribers"
                                  ? "subscribers"
                                  : "aging",
                                "xlsx",
                              )
                            }
                          >
                            <Download size={15} /> Export
                          </button>
                        )}
                    </div>
                  </div>
                  {page === "Subscribers" && (
                    <Table
                      rows={rows}
                      onRow={openProfile}
                      columns={[
                        [
                          "account_no",
                          "Account",
                          (r) => (
                            <span className="mono blue-text">
                              {r.account_no}
                            </span>
                          ),
                        ],
                        [
                          "name",
                          "Subscriber",
                          (r) => (
                            <div className="cell-person">
                              <span className="avatar">
                                {r.name.slice(0, 2)}
                              </span>
                              <div>
                                <strong>{r.name}</strong>
                                <small>{r.contact}</small>
                              </div>
                            </div>
                          ),
                        ],
                        ["area", "Collection area"],
                        ["collector", "Collector"],
                        ["status", "Status", (r) => <Badge value={r.status} />],
                        [
                          "outstanding",
                          "Outstanding",
                          (r) => money(r.outstanding),
                        ],
                      ]}
                    />
                  )}
                  {page === "Billing" && (
                    <Table
                      rows={rows}
                      columns={[
                        [
                          "number",
                          "Invoice",
                          (r) => (
                            <span className="mono blue-text">{r.number}</span>
                          ),
                        ],
                        ["name", "Subscriber"],
                        ["period", "Billing period", (r) => date(r.period)],
                        ["due_date", "Due date", (r) => date(r.due_date)],
                        [
                          "status",
                          "Status",
                          (r) => (
                            <Badge
                              value={
                                Number(r.balance) > 0 &&
                                new Date(r.due_date) < new Date()
                                  ? "OVERDUE"
                                  : r.status
                              }
                            />
                          ),
                        ],
                        ["total", "Billed", (r) => money(r.total)],
                        ["balance", "Balance", (r) => money(r.balance)],
                        [
                          "action",
                          "",
                          (r) =>
                            can("payment.reverse") ? (
                              <div className="actions">
                                <button
                                  onClick={() => {
                                    setSelected(r);
                                    setModal("adjust");
                                  }}
                                >
                                  Adjust
                                </button>
                                <button
                                  disabled={r.status === "VOID"}
                                  onClick={() => {
                                    setSelected(r);
                                    setModal("void");
                                  }}
                                >
                                  Void
                                </button>
                              </div>
                            ) : null,
                        ],
                      ]}
                    />
                  )}
                  {page === "Payments" && (
                    <Table
                      rows={rows}
                      columns={[
                        [
                          "receipt_no",
                          "Receipt",
                          (r) => (
                            <span className="mono blue-text">
                              {r.receipt_no}
                            </span>
                          ),
                        ],
                        ["name", "Subscriber"],
                        ["paid_at", "Paid on", (r) => date(r.paid_at)],
                        ["method", "Method", (r) => <Badge value={r.method} />],
                        ["amount", "Amount", (r) => money(r.amount)],
                        [
                          "reversed",
                          "Status",
                          (r) => (
                            <Badge value={r.reversed ? "REVERSED" : "POSTED"} />
                          ),
                        ],
                        [
                          "action",
                          "",
                          (r) => (
                            <div className="actions">
                              <button
                                onClick={() => {
                                  setSelected(r);
                                  setModal("receipt");
                                }}
                              >
                                <Printer size={14} />
                              </button>
                              {can("payment.reverse") && !r.reversed && (
                                <button
                                  onClick={() => {
                                    setSelected(r);
                                    setModal("reverse");
                                  }}
                                >
                                  Reverse
                                </button>
                              )}
                            </div>
                          ),
                        ],
                      ]}
                    />
                  )}
                  {page === "Receivables" && (
                    <Table
                      rows={rows}
                      onRow={can("subscriber.view") ? openProfile : undefined}
                      columns={[
                        ["account_no", "Account"],
                        ["name", "Subscriber"],
                        ["area", "Area"],
                        ["collector", "Collector"],
                        ["oldest_due", "Oldest due", (r) => date(r.oldest_due)],
                        ["unpaid_invoices", "Unpaid invoices"],
                        [
                          "last_payment",
                          "Last payment",
                          (r) => date(r.last_payment),
                        ],
                        [
                          "outstanding",
                          "Outstanding",
                          (r) => (
                            <strong className="amber">
                              {money(r.outstanding)}
                            </strong>
                          ),
                        ],
                      ]}
                    />
                  )}
                  {page === "Services" && serviceView !== "reconnections" && (
                    <Table
                      rows={rows}
                      columns={[
                        ["account_no", "Service account"],
                        ["plan", "Plan"],
                        ["address", "Installation address"],
                        ["status", "Status", (r) => <Badge value={r.status} />],
                        ["rate", "Monthly rate", (r) => money(r.rate)],
                        [
                          "action",
                          "",
                          (r) =>
                            can("service.manage") ? (
                              <button
                                onClick={() => {
                                  setSelected(r);
                                  setModal("service-state");
                                }}
                              >
                                Change status
                              </button>
                            ) : null,
                        ],
                      ]}
                    />
                  )}
                  {page === "Services" && serviceView === "reconnections" && (
                    <Table
                      rows={rows}
                      columns={[
                        ["id", "Request"],
                        ["service_id", "Service ID"],
                        [
                          "requested_at",
                          "Requested",
                          (r) => date(r.requested_at),
                        ],
                        [
                          "completed_at",
                          "Completed",
                          (r) => date(r.completed_at),
                        ],
                        [
                          "actions",
                          "",
                          (r) =>
                            !r.completed_at && can("service.complete") ? (
                              <button
                                onClick={() =>
                                  run(async () => {
                                    await api(
                                      `/reconnections/${r.id}/complete`,
                                      {},
                                    );
                                    await reload();
                                    setNotice(
                                      "Reconnection completed and service activated.",
                                    );
                                  })
                                }
                              >
                                Complete reconnection
                              </button>
                            ) : null,
                        ],
                      ]}
                    />
                  )}
                  {page === "Audit Trail" && (
                    <Table
                      rows={rows}
                      columns={[
                        [
                          "created_at",
                          "Date / time",
                          (r) => new Date(r.created_at).toLocaleString(),
                        ],
                        ["actor", "Actor"],
                        [
                          "action",
                          "Action",
                          (r) => <span className="mono">{r.action}</span>,
                        ],
                        ["entity", "Record type"],
                        ["entity_id", "Record ID"],
                        ["reason", "Reason"],
                      ]}
                    />
                  )}
                  <div className="pagination">
                    <span>
                      {data.total ? `${data.total} subscribers · ` : ""}Page{" "}
                      {pageNo} · {rows.length} records
                    </span>
                    <div className="actions">
                      <button
                        disabled={pageNo === 1}
                        onClick={() => setPageNo((n) => n - 1)}
                      >
                        Previous
                      </button>
                      <button
                        disabled={
                          rows.length < (page === "Subscribers" ? 25 : 50)
                        }
                        onClick={() => setPageNo((n) => n + 1)}
                      >
                        Next
                      </button>
                    </div>
                  </div>
                </section>
              )}
              {page === "GCash Verification" && (
                <div className="proof-layout">
                  <section className="panel">
                    <div className="panel-head">
                      <h2>Payment review queue</h2>
                      <Badge
                        value={`${rows.filter((r: Row) => r.status === "PENDING").length} pending`}
                      />
                    </div>
                    {rows.map((r: Row) => (
                      <button
                        className={
                          "proof-row " +
                          (selected?.id === r.id ? "selected" : "")
                        }
                        onClick={() => setSelected(r)}
                        key={r.id}
                      >
                        <div>
                          <strong>{r.name}</strong>
                          <small>{r.reference}</small>
                          <Badge value={r.status} />
                        </div>
                        <strong>{money(r.amount)}</strong>
                      </button>
                    ))}
                    {!rows.length && (
                      <div className="empty">No proofs to review</div>
                    )}
                  </section>
                  <section className="panel proof-detail">
                    {selected ? (
                      <>
                        <div className="panel-head">
                          <div>
                            <h2>{selected.name}</h2>
                            <p>Reference {selected.reference}</p>
                          </div>
                          <strong>{money(selected.amount)}</strong>
                        </div>
                        <div className="proof-preview">
                          {proofUrl ? (
                            <img
                              src={proofUrl}
                              alt="Customer-submitted GCash payment evidence"
                            />
                          ) : (
                            <div className="empty">
                              <FileText size={36} />
                              <p>No proof image attached</p>
                            </div>
                          )}
                        </div>
                        <div className="proof-meta">
                          <span>
                            Sender<strong>{selected.sender}</strong>
                          </span>
                          <span>
                            Received<strong>{date(selected.created_at)}</strong>
                          </span>
                          <span>
                            Status
                            <Badge value={selected.status} />
                          </span>
                        </div>
                        {selected.status === "PENDING" && (
                          <>
                            <p className="info-note">
                              Verify the reference and amount against the
                              business GCash transaction history. A screenshot
                              alone does not confirm payment.
                            </p>
                            <div className="actions pad">
                              <button
                                className="danger"
                                onClick={() => {
                                  setModal("reject");
                                }}
                              >
                                Reject proof
                              </button>
                              <button
                                className="primary"
                                onClick={() => setModal("verify")}
                              >
                                Verify & post payment
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <div className="empty">
                        <ShieldCheck size={36} />
                        <h3>Select a payment proof</h3>
                        <p>Review the evidence and confirm the transaction.</p>
                      </div>
                    )}
                  </section>
                </div>
              )}
              {page === "Collections" && (
                <>
                  <div className="collection-kpis">
                    <div className="mini-stat">
                      Open batches
                      <strong>
                        {rows.filter((r: Row) => r.status !== "CLOSED").length}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      Cash collected
                      <strong>
                        {money(
                          rows.reduce(
                            (a: number, r: Row) => a + Number(r.cash),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      Non-cash collected
                      <strong>
                        {money(
                          rows.reduce(
                            (a: number, r: Row) => a + Number(r.noncash),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      Remittance difference
                      <strong>
                        {money(
                          rows.reduce(
                            (a: number, r: Row) =>
                              a + Number(r.difference || 0),
                            0,
                          ),
                        )}
                      </strong>
                    </div>
                  </div>
                  <section className="panel">
                    <Table
                      rows={rows}
                      columns={[
                        [
                          "id",
                          "Batch",
                          (r) => `BATCH-${String(r.id).padStart(4, "0")}`,
                        ],
                        ["collector", "Collector"],
                        ["area", "Area"],
                        ["status", "Status", (r) => <Badge value={r.status} />],
                        ["expected", "Expected", (r) => money(r.expected)],
                        ["cash", "Cash", (r) => money(r.cash)],
                        ["noncash", "Non-cash", (r) => money(r.noncash)],
                        [
                          "difference",
                          "Difference",
                          (r) =>
                            r.difference === null ? (
                              "—"
                            ) : (
                              <span
                                className={
                                  Number(r.difference) < 0 ? "red-text" : ""
                                }
                              >
                                {money(r.difference)}
                              </span>
                            ),
                        ],
                        [
                          "actions",
                          "",
                          (r) => (
                            <button
                              onClick={() => {
                                setSelected(r);
                                setModal("reconcile");
                              }}
                            >
                              Open batch <ChevronRight size={13} />
                            </button>
                          ),
                        ],
                      ]}
                    />
                  </section>
                  <div className="actions pad">
                    {can("collection.manage") && (
                      <>
                        <button onClick={() => setModal("collector")}>
                          Add collector
                        </button>
                        <button onClick={() => setModal("area")}>
                          Add area / route
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
              {page === "Reports" && (
                <>
                  <div className="report-filter">
                    <Field label="From">
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                    </Field>
                    <Field label="To">
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                    </Field>
                    <p>
                      Export live financial records for your selected period.
                      <br />
                      Aging reflects balances as of today.
                    </p>
                  </div>
                  <div className="report-grid">
                    {[
                      [
                        "collections",
                        "Collection summary",
                        "Daily collection totals by payment method.",
                      ],
                      [
                        "aging",
                        "Accounts receivable aging",
                        "Current and overdue balances across all aging buckets.",
                      ],
                      [
                        "collectors",
                        "Collector remittance",
                        "Cash accountability, shortages, and overages.",
                      ],
                      [
                        "revenue",
                        "Billing by plan",
                        "Invoiced subscription revenue by service plan.",
                      ],
                      [
                        "subscribers",
                        "Subscriber master list",
                        "Subscriber account, contact, and service status.",
                      ],
                      [
                        "reversals",
                        "Payment reversals",
                        "Preserved receipts, correction reasons, and actors.",
                      ],
                    ].map(([type, title, desc]) => (
                      <section className="panel report-card" key={type}>
                        <div className="report-icon">
                          <FileText size={23} />
                        </div>
                        <h2>{title}</h2>
                        <p>{desc}</p>
                        <div className="actions">
                          <button
                            disabled={!can("report.export") || busy}
                            onClick={() => download(type, "pdf")}
                          >
                            <Download size={14} /> PDF
                          </button>
                          <button
                            disabled={!can("report.export") || busy}
                            onClick={() => download(type, "xlsx")}
                          >
                            Excel
                          </button>
                        </div>
                      </section>
                    ))}
                  </div>
                  <p className="muted">
                    Subscriber Statements of Account are available from the
                    subscriber’s Ledger tab.
                  </p>
                </>
              )}
              {page === "Administration" && (
                <>
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Team access</h2>
                        <p>Permissions are enforced by the central server.</p>
                      </div>
                      <ShieldCheck size={20} />
                    </div>
                    <Table
                      rows={rows}
                      columns={[
                        ["name", "Team member"],
                        ["username", "Username"],
                        ["roles", "Roles", (r) => r.roles.join(", ")],
                        [
                          "active",
                          "Status",
                          (r) => (
                            <Badge value={r.active ? "ACTIVE" : "INACTIVE"} />
                          ),
                        ],
                        [
                          "action",
                          "",
                          (r) => (
                            <button
                              disabled={r.id === user.id}
                              onClick={() =>
                                run(async () => {
                                  await api(`/users/${r.id}/active`, {
                                    active: !r.active,
                                  });
                                  await reload();
                                })
                              }
                            >
                              {r.active ? "Deactivate" : "Activate"}
                            </button>
                          ),
                        ],
                      ]}
                    />
                  </section>
                  <div className="report-grid admin-cards">
                    <section className="panel report-card">
                      <ShieldCheck size={25} />
                      <h2>Backup & recovery</h2>
                      <p>
                        Create a PostgreSQL archive and attachment snapshot.
                        Restore is an offline, administrator-controlled
                        maintenance operation.
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
                        {lookups.plans.length} plans configured. Billed rates
                        remain preserved in invoice history.
                      </p>
                      <button onClick={() => setModal("plans")}>
                        Manage plans
                      </button>
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            BCIS · Subscription Billing & Collection System{" "}
            <span>Centralized records. Accountable operations.</span>
          </footer>
        </div>
      </main>
      {modal && (
        <div className="modal-backdrop">
          <section
            className={
              "modal " +
              (["profile", "payment", "reconcile"].includes(modal)
                ? "wide"
                : "")
            }
            role="dialog"
            aria-modal="true"
            aria-label={modal}
          >
            <div className="modal-head">
              <div>
                <div className="eyebrow">BCIS WORKSPACE</div>
                <h2>
                  {
                    (
                      {
                        subscriber: "New subscriber",
                        "subscriber-edit": "Edit subscriber",
                        "subscriber-status": "Subscriber status",
                        rate: "Update future service rate",
                        plans: "Service plan directory",
                        "plan-edit": "Edit service plan",
                        billing: "Generate monthly billing",
                        payment: "Receive payment",
                        proof: "Record GCash proof",
                        batch: "Create collection batch",
                        user: "Add team member",
                        profile: profile?.subscriber.name,
                        receipt: "Payment receipt",
                        reverse: "Reverse payment",
                        verify: "Verify GCash payment",
                        reject: "Reject GCash proof",
                        reconcile: `Collection batch #${selected?.id}`,
                        "service-state": "Service status",
                        settings: "Service policy",
                        plan: "Create service plan",
                        service: "Add service account",
                        area: "Add collection area",
                        collector: "Add collector",
                        adjust: "Invoice adjustment",
                        void: "Void invoice",
                      } as Row
                    )[modal]
                  }
                </h2>
              </div>
              <button
                onClick={() => {
                  setModal("");
                  setError("");
                }}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            {error && <div className="error">{error}</div>}
            {["subscriber", "subscriber-edit"].includes(modal) && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    const subscriber = await api(
                      modal === "subscriber-edit"
                        ? `/subscribers/${profile!.subscriber.id}/edit`
                        : "/subscribers",
                      {
                        ...b,
                        areaId: Number(b.areaId),
                        collectorId: Number(b.collectorId),
                        billingDay: Number(b.billingDay),
                        dueDay: Number(b.dueDay),
                      },
                    );
                    await done(
                      modal === "subscriber-edit"
                        ? `Subscriber ${subscriber.account_no} updated.`
                        : `Subscriber ${subscriber.account_no} registered. Open the profile to add services.`,
                    );
                  })
                }
              >
                <div className="form-grid">
                  <Field
                    label={
                      modal === "subscriber-edit"
                        ? "Account number *"
                        : "Account number"
                    }
                  >
                    <input
                      name="accountNo"
                      required={modal === "subscriber-edit"}
                      disabled={modal !== "subscriber-edit"}
                      placeholder="Automatically assigned when saved"
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.account_no
                          : ""
                      }
                    />
                  </Field>
                  <Field label="Full name *">
                    <input
                      name="name"
                      required
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.name
                          : ""
                      }
                    />
                  </Field>
                  <Field label="Contact number">
                    <input
                      name="contact"
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.contact
                          : ""
                      }
                    />
                  </Field>
                  <Field label="Address *">
                    <input
                      name="address"
                      required
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.address
                          : ""
                      }
                    />
                  </Field>
                  <Field label="Collection area *">
                    <select
                      name="areaId"
                      required
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.area_id
                          : undefined
                      }
                    >
                      {lookups.areas.map((r: Row) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Assigned collector *">
                    <select
                      name="collectorId"
                      required
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.collector_id
                          : undefined
                      }
                    >
                      {lookups.collectors.map((r: Row) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Billing day *">
                    <input
                      name="billingDay"
                      type="number"
                      min="1"
                      max="28"
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.billing_day
                          : 1
                      }
                      required
                    />
                  </Field>
                  <Field label="Due day *">
                    <input
                      name="dueDay"
                      type="number"
                      min="1"
                      max="28"
                      defaultValue={
                        modal === "subscriber-edit"
                          ? profile?.subscriber.due_day
                          : 15
                      }
                      required
                    />
                  </Field>
                </div>
                <Field label="Notes">
                  <textarea
                    name="notes"
                    defaultValue={
                      modal === "subscriber-edit"
                        ? profile?.subscriber.notes
                        : ""
                    }
                  />
                </Field>
                <button className="primary" disabled={busy}>
                  Save subscriber
                </button>
              </form>
            )}
            {modal === "billing" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    const r = await api("/billing/generate", {
                      period: b.period + "-01",
                    });
                    await done(
                      `${r.count} invoices generated. Existing invoices were preserved.`,
                    );
                  })
                }
              >
                <p>
                  Bill active service accounts at their current agreed rate.
                  Subscriber credits are applied automatically. Re-running a
                  period does not duplicate invoices.
                </p>
                <Field label="Billing month *">
                  <input
                    type="month"
                    name="period"
                    defaultValue={today().slice(0, 7)}
                    required
                  />
                </Field>
                <button className="primary" disabled={busy}>
                  Generate invoices
                </button>
              </form>
            )}
            {modal === "payment" && (
              <PaymentForm
                api={api}
                busy={busy}
                submit={submit}
                onDone={async (r) => {
                  setSelected(r);
                  await reload();
                  setModal("receipt");
                }}
              />
            )}
            {modal === "receipt" && selected && (
              <div className="receipt printable">
                <div className="receipt-brand">BCIS</div>
                <h3>Bukidnon Cable and Internet Services</h3>
                <p>Payment acknowledgment · {selected.receipt_no}</p>
                <hr />
                <dl>
                  <dt>Subscriber</dt>
                  <dd>
                    {selected.name || `Account ID ${selected.subscriber_id}`}
                  </dd>
                  <dt>Date</dt>
                  <dd>{date(selected.paid_at)}</dd>
                  <dt>Payment method</dt>
                  <dd>{selected.method}</dd>
                  <dt>Reference</dt>
                  <dd>{selected.reference || "—"}</dd>
                  <dt>Status</dt>
                  <dd>{selected.reversed ? "REVERSED" : "POSTED"}</dd>
                </dl>
                <div className="receipt-total">
                  Amount received<strong>{money(selected.amount)}</strong>
                </div>
                <p>Thank you for choosing BCIS.</p>
                <button
                  className="primary no-print"
                  onClick={() => window.print()}
                >
                  <Printer size={16} /> Print receipt
                </button>
              </div>
            )}
            {["reverse", "verify", "reject", "adjust", "void"].includes(
              modal,
            ) && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    if (modal === "void")
                      await api(`/invoices/${selected!.id}/void`, b);
                    else if (modal === "reverse")
                      await api(`/payments/${selected!.id}/reverse`, b);
                    else if (modal === "adjust")
                      await api(`/invoices/${selected!.id}/adjust`, {
                        reason: b.reason,
                        amount:
                          (b.direction === "credit" ? -1 : 1) *
                          centavos(b.amount),
                      });
                    else
                      await api(`/proofs/${selected!.id}/review`, {
                        decision: modal === "verify" ? "VERIFIED" : "REJECTED",
                        reason: b.reason,
                      });
                    await done(
                      "Financial record updated and audit entry recorded.",
                    );
                    setSelected(null);
                  })
                }
              >
                <p>
                  {modal === "void"
                    ? "Voiding preserves the invoice and records an offsetting credit. Allocated payments must be reversed first."
                    : modal === "reverse"
                      ? "The original receipt remains visible. Its allocations will no longer reduce the invoice balances."
                      : modal === "verify"
                        ? "Confirm that this reference and amount match the business GCash transaction history. Verification posts the payment immediately."
                        : modal === "adjust"
                          ? "Add a traceable debit or credit adjustment without changing the original invoice."
                          : "Record why this proof cannot be accepted."}
                </p>
                {modal === "adjust" && (
                  <>
                    <Field label="Adjustment">
                      <select name="direction">
                        <option value="credit">Credit / discount</option>
                        <option value="debit">Debit / fee</option>
                      </select>
                    </Field>
                    <Field label="Amount (PHP) *">
                      <input name="amount" required inputMode="decimal" />
                    </Field>
                  </>
                )}
                <Field label="Reason *">
                  <textarea name="reason" required minLength={5} />
                </Field>
                <button
                  className={modal === "reverse" ? "danger" : "primary"}
                  disabled={busy}
                >
                  Confirm {modal}
                </button>
              </form>
            )}
            {modal === "proof" && (
              <form
                onSubmit={(e) => {
                  const form = e.currentTarget;
                  submit(e, async (b) => {
                    const r = await api("/proofs", {
                      subscriberId: Number(b.subscriberId),
                      reference: b.reference,
                      sender: b.sender,
                      amount: centavos(b.amount),
                    });
                    const file = (
                      form.elements.namedItem("proofFile") as HTMLInputElement
                    ).files?.[0];
                    if (file) await uploadProof(r.id, file);
                    await done(
                      "GCash proof recorded. Verification is required before posting.",
                    );
                  });
                }}
              >
                <SubscriberPicker />
                <Field label="GCash reference *">
                  <input name="reference" minLength={6} required />
                </Field>
                <Field label="Sender name *">
                  <input name="sender" required />
                </Field>
                <Field label="Amount (PHP) *">
                  <input name="amount" inputMode="decimal" required />
                </Field>
                <Field label="Proof image (PNG / JPEG, up to 5 MB) *">
                  <input
                    type="file"
                    name="proofFile"
                    accept="image/png,image/jpeg"
                    required
                  />
                </Field>
                <button className="primary" disabled={busy}>
                  Submit for verification
                </button>
              </form>
            )}
            {modal === "batch" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api("/batches", {
                      collectorId: Number(b.collectorId),
                      areaId: Number(b.areaId),
                    });
                    await done(
                      "Collection batch created with assigned subscriber balances.",
                    );
                  })
                }
              >
                <Field label="Collector *">
                  <select name="collectorId">
                    {lookups.collectors.map((r: Row) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Area / route *">
                  <select name="areaId">
                    {lookups.areas.map((r: Row) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <button className="primary" disabled={busy}>
                  Create batch
                </button>
              </form>
            )}
            {modal === "reconcile" && selected && (
              <>
                <div className="collection-kpis">
                  <div className="mini-stat">
                    Expected cash<strong>{money(selected.cash)}</strong>
                  </div>
                  <div className="mini-stat">
                    Remitted cash
                    <strong>{money(selected.remitted_cash || 0)}</strong>
                  </div>
                  <div className="mini-stat">
                    Difference
                    <strong
                      className={
                        Number(selected.difference) < 0 ? "red-text" : ""
                      }
                    >
                      {selected.difference === null
                        ? "Not remitted"
                        : money(selected.difference)}
                    </strong>
                  </div>
                </div>
                <p>
                  Collector: <strong>{selected.collector}</strong> · Area:{" "}
                  {selected.area} · <Badge value={selected.status} />
                </p>
                <p>
                  Non-cash collections:{" "}
                  <strong>{money(selected.noncash)}</strong>. Shortages and
                  overages remain recorded when a batch is closed.
                </p>
                <button
                  onClick={() =>
                    run(async () => {
                      const route = await api(`/batches/${selected.id}/route`);
                      setSelected({ ...selected, route });
                    })
                  }
                >
                  Show printable route sheet
                </button>
                {selected.route && (
                  <div className="printable">
                    <h3>Route sheet · {selected.collector}</h3>
                    <Table
                      rows={selected.route}
                      columns={[
                        ["account_no", "Account"],
                        ["name", "Subscriber"],
                        ["address", "Address"],
                        ["expected", "Expected", (r) => money(r.expected)],
                      ]}
                    />
                    <button className="no-print" onClick={() => window.print()}>
                      <Printer size={15} /> Print route
                    </button>
                  </div>
                )}
                {can("collection.reconcile") &&
                  selected.status !== "CLOSED" && (
                    <form
                      onSubmit={(e) =>
                        submit(e, async (b) => {
                          if (selected.status === "SUBMITTED")
                            await api(`/batches/${selected.id}/remit`, {
                              amount: centavos(b.amount),
                              reason: b.reason,
                            });
                          else
                            await api(`/batches/${selected.id}/transition`, {
                              status: ["OPEN", "IN_PROGRESS"].includes(
                                selected.status,
                              )
                                ? "SUBMITTED"
                                : selected.status === "REMITTED"
                                  ? "RECONCILED"
                                  : "CLOSED",
                              reason: b.reason,
                            });
                          await done(
                            "Batch updated. Remittance differences remain in the audit history.",
                          );
                        })
                      }
                    >
                      {selected.status === "SUBMITTED" && (
                        <Field label="Cash remitted (PHP) *">
                          <input name="amount" inputMode="decimal" required />
                        </Field>
                      )}
                      <Field label="Confirmation / exception reason *">
                        <textarea name="reason" required minLength={5} />
                      </Field>
                      <button className="primary" disabled={busy}>
                        {["OPEN", "IN_PROGRESS"].includes(selected.status)
                          ? "Submit batch"
                          : selected.status === "SUBMITTED"
                            ? "Record remittance"
                            : selected.status === "REMITTED"
                              ? "Confirm reconciliation"
                              : "Approve and close batch"}
                      </button>
                    </form>
                  )}
              </>
            )}
            {modal === "user" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api("/users", b);
                    await done("Team member added.");
                  })
                }
              >
                <Field label="Full name *">
                  <input name="name" required />
                </Field>
                <Field label="Username *">
                  <input name="username" required autoComplete="off" />
                </Field>
                <Field label="Password (12+ characters) *">
                  <input
                    type="password"
                    name="password"
                    required
                    minLength={12}
                    autoComplete="new-password"
                  />
                </Field>
                <Field label="Role *">
                  <select name="role">
                    {[
                      "Administrator",
                      "Cashier",
                      "Collection Supervisor",
                      "Auditor",
                      "Technician",
                      "Viewer",
                      "Owner",
                    ].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <button className="primary" disabled={busy}>
                  Create user
                </button>
              </form>
            )}
            {modal === "settings" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api("/settings", {
                      graceDays: Number(b.graceDays),
                      suspensionDays: Number(b.suspensionDays),
                    });
                    await done("Service policy saved.");
                  })
                }
              >
                <Field label="Grace period (days)">
                  <input
                    type="number"
                    name="graceDays"
                    min="0"
                    max="90"
                    defaultValue="7"
                    required
                  />
                </Field>
                <Field label="Suspension threshold (days overdue)">
                  <input
                    type="number"
                    name="suspensionDays"
                    min="1"
                    max="365"
                    defaultValue="60"
                    required
                  />
                </Field>
                <button className="primary" disabled={busy}>
                  Save policy
                </button>
              </form>
            )}
            {modal === "service-state" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    const r = await api(`/services/${selected!.id}/state`, b);
                    await done(r.message || "Service status updated.");
                  })
                }
              >
                <Field label="New status">
                  <select name="status">
                    <option value="SUSPENDED">Suspend</option>
                    <option value="ACTIVE">Request reconnection</option>
                    <option value="TERMINATED">Terminate</option>
                  </select>
                </Field>
                <Field label="Reason *">
                  <textarea name="reason" required minLength={5} />
                </Field>
                <button className="primary" disabled={busy}>
                  Record service change
                </button>
              </form>
            )}
            {["area", "collector"].includes(modal) && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api(modal === "area" ? "/areas" : "/collectors", b);
                    await done("Record created.");
                  })
                }
              >
                <Field label="Name *">
                  <input name="name" required />
                </Field>
                <button className="primary" disabled={busy}>
                  Create
                </button>
              </form>
            )}
            {modal === "plan" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api("/plans", { ...b, price: centavos(b.price) });
                    await done("Service plan created.");
                  })
                }
              >
                <Field label="Code *">
                  <input name="code" required />
                </Field>
                <Field label="Plan name *">
                  <input name="name" required />
                </Field>
                <Field label="Service type">
                  <select name="type">
                    <option>Internet</option>
                    <option>Cable</option>
                    <option>Combo</option>
                  </select>
                </Field>
                <Field label="Monthly price (PHP) *">
                  <input name="price" inputMode="decimal" required />
                </Field>
                <button className="primary" disabled={busy}>
                  Create plan
                </button>
              </form>
            )}
            {modal === "service" && profile && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api("/services", {
                      ...b,
                      subscriberId: profile.subscriber.id,
                      planId: Number(b.planId),
                      rate: centavos(b.rate),
                      dueDay: Number(b.dueDay),
                    });
                    await done("Service account created.");
                  })
                }
              >
                <Field label="Service account number *">
                  <input name="accountNo" required />
                </Field>
                <Field label="Plan *">
                  <select name="planId">
                    {lookups.plans.map((r: Row) => (
                      <option key={r.id} value={r.id}>
                        {r.name} · {money(r.price)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Agreed monthly rate (PHP) *">
                  <input name="rate" required inputMode="decimal" />
                </Field>
                <Field label="Installation address *">
                  <input
                    name="address"
                    defaultValue={profile.subscriber.address}
                    required
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Activation date *">
                    <input
                      type="date"
                      name="activationDate"
                      defaultValue={today()}
                      required
                    />
                  </Field>
                  <Field label="Billing start *">
                    <input
                      type="date"
                      name="billingStart"
                      defaultValue={today()}
                      required
                    />
                  </Field>
                </div>
                <Field label="Due day *">
                  <input
                    type="number"
                    min="1"
                    max="28"
                    name="dueDay"
                    defaultValue={profile.subscriber.due_day}
                    required
                  />
                </Field>
                <button className="primary" disabled={busy}>
                  Create service account
                </button>
              </form>
            )}
            {modal === "subscriber-status" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api(
                      `/subscribers/${profile!.subscriber.id}/status`,
                      b,
                    );
                    await done(
                      "Subscriber status updated. Financial history is preserved.",
                    );
                  })
                }
              >
                <Field label="Status">
                  <select name="status">
                    {["ACTIVE", "INACTIVE", "TERMINATED", "ARCHIVED"].map(
                      (v) => (
                        <option key={v}>{v}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Reason *">
                  <textarea name="reason" required minLength={5} />
                </Field>
                <button className="primary" disabled={busy}>
                  Save status
                </button>
              </form>
            )}
            {modal === "rate" && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api(`/services/${selected!.id}/rate`, {
                      rate: centavos(b.rate),
                      reason: b.reason,
                    });
                    await done(
                      "Future rate updated. Historical invoices are unchanged.",
                    );
                  })
                }
              >
                <Field label="New monthly rate (PHP) *">
                  <input
                    name="rate"
                    required
                    defaultValue={(Number(selected?.rate) / 100).toFixed(2)}
                  />
                </Field>
                <Field label="Reason *">
                  <textarea name="reason" minLength={5} required />
                </Field>
                <button className="primary" disabled={busy}>
                  Update future rate
                </button>
              </form>
            )}
            {modal === "plans" && (
              <>
                <Table
                  rows={lookups.plans}
                  columns={[
                    ["code", "Code"],
                    ["name", "Plan"],
                    ["type", "Type"],
                    ["price", "Price", (r) => money(r.price)],
                    [
                      "active",
                      "Status",
                      (r) => <Badge value={r.active ? "ACTIVE" : "INACTIVE"} />,
                    ],
                    [
                      "action",
                      "",
                      (r) => (
                        <button
                          onClick={() => {
                            setSelected(r);
                            setModal("plan-edit");
                          }}
                        >
                          Edit
                        </button>
                      ),
                    ],
                  ]}
                />
                <button className="primary" onClick={() => setModal("plan")}>
                  Create plan
                </button>
              </>
            )}
            {modal === "plan-edit" && selected && (
              <form
                onSubmit={(e) =>
                  submit(e, async (b) => {
                    await api(`/plans/${selected.id}/edit`, {
                      ...b,
                      price: centavos(b.price),
                      fee: centavos(b.fee),
                      speed: b.speed ? Number(b.speed) : null,
                      channels: b.channels ? Number(b.channels) : null,
                      active: b.active === "true",
                    });
                    await done(
                      "Plan updated. Existing service rates and invoices are preserved.",
                    );
                  })
                }
              >
                <div className="form-grid">
                  <Field label="Code *">
                    <input name="code" required defaultValue={selected.code} />
                  </Field>
                  <Field label="Name *">
                    <input name="name" required defaultValue={selected.name} />
                  </Field>
                  <Field label="Type">
                    <select name="type" defaultValue={selected.type}>
                      <option>Internet</option>
                      <option>Cable</option>
                      <option>Combo</option>
                    </select>
                  </Field>
                  <Field label="Price (PHP) *">
                    <input
                      name="price"
                      required
                      defaultValue={(Number(selected.price) / 100).toFixed(2)}
                    />
                  </Field>
                  <Field label="Standard fee (PHP)">
                    <input
                      name="fee"
                      required
                      defaultValue={(Number(selected.fee) / 100).toFixed(2)}
                    />
                  </Field>
                  <Field label="Speed (Mbps)">
                    <input
                      name="speed"
                      type="number"
                      min="0"
                      defaultValue={selected.speed ?? ""}
                    />
                  </Field>
                  <Field label="Channel count">
                    <input
                      name="channels"
                      type="number"
                      min="0"
                      defaultValue={selected.channels ?? ""}
                    />
                  </Field>
                  <Field label="Availability">
                    <select
                      name="active"
                      defaultValue={String(selected.active)}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    name="description"
                    defaultValue={selected.description}
                  />
                </Field>
                <button className="primary" disabled={busy}>
                  Save plan
                </button>
              </form>
            )}
            {modal === "profile" && profile && (
              <>
                <div className="profile-summary">
                  <span className="avatar large">
                    {profile.subscriber.name.slice(0, 2)}
                  </span>
                  <div>
                    <strong>{profile.subscriber.account_no}</strong>
                    <p>
                      {profile.subscriber.address} ·{" "}
                      {profile.subscriber.contact}
                    </p>
                  </div>
                  <Badge value={profile.subscriber.status} />
                </div>
                <div className="tabs">
                  {[
                    "Overview",
                    "Services",
                    "Billing",
                    "Payments",
                    "Ledger",
                    "Collection",
                    "Service history",
                    "Documents",
                    ...(can("audit.view") ? ["Audit"] : []),
                  ].map((t) => (
                    <button
                      className={tab === t ? "active" : ""}
                      onClick={() => setTab(t)}
                      key={t}
                    >
                      {t}
                    </button>
                  ))}
                </div>
                {tab === "Overview" && (
                  <>
                    <div className="collection-kpis">
                      <div className="mini-stat">
                        Ledger balance
                        <strong>
                          {money(profile.ledger.at(-1)?.balance || 0)}
                        </strong>
                      </div>
                      <div className="mini-stat">
                        Service accounts
                        <strong>{profile.services.length}</strong>
                      </div>
                      <div className="mini-stat">
                        Payment records
                        <strong>{profile.payments.length}</strong>
                      </div>
                    </div>
                    {can("subscriber.edit") && (
                      <div className="actions">
                        <button onClick={() => setModal("subscriber-edit")}>
                          Edit subscriber
                        </button>
                        <button onClick={() => setModal("subscriber-status")}>
                          Change status
                        </button>
                      </div>
                    )}
                    <p>{profile.subscriber.notes || "No account notes."}</p>
                    <p>
                      Billing day: {profile.subscriber.billing_day} · Due day:{" "}
                      {profile.subscriber.due_day}
                    </p>
                  </>
                )}
                {tab === "Services" && (
                  <>
                    <Table
                      rows={profile.services}
                      columns={[
                        ["account_no", "Service"],
                        ["plan", "Plan"],
                        ["status", "Status", (r) => <Badge value={r.status} />],
                        ["rate", "Rate", (r) => money(r.rate)],
                        [
                          "action",
                          "",
                          (r) =>
                            can("subscriber.edit") ? (
                              <button
                                onClick={() => {
                                  setSelected(r);
                                  setModal("rate");
                                }}
                              >
                                Change future rate
                              </button>
                            ) : null,
                        ],
                      ]}
                    />
                    {can("subscriber.edit") && (
                      <button onClick={() => setModal("service")}>
                        <Plus size={15} /> Add service
                      </button>
                    )}
                  </>
                )}
                {tab === "Billing" && (
                  <Table
                    rows={profile.invoices}
                    columns={[
                      ["number", "Invoice"],
                      ["due_date", "Due", (r) => date(r.due_date)],
                      ["status", "Status", (r) => <Badge value={r.status} />],
                      ["total", "Total", (r) => money(r.total)],
                      ["balance", "Balance", (r) => money(r.balance)],
                    ]}
                  />
                )}
                {tab === "Payments" && (
                  <Table
                    rows={profile.payments}
                    columns={[
                      ["receipt_no", "Receipt"],
                      ["paid_at", "Date", (r) => date(r.paid_at)],
                      ["method", "Method"],
                      ["amount", "Amount", (r) => money(r.amount)],
                      [
                        "reversed",
                        "Status",
                        (r) => (
                          <Badge value={r.reversed ? "REVERSED" : "POSTED"} />
                        ),
                      ],
                    ]}
                  />
                )}
                {tab === "Ledger" && (
                  <>
                    <div className="actions report-filter">
                      <input
                        type="date"
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                      />
                      <input
                        type="date"
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                      />
                      {can("report.export") && (
                        <>
                          <button
                            onClick={() =>
                              download("soa", "pdf", profile.subscriber.id)
                            }
                          >
                            SOA · PDF
                          </button>
                          <button
                            onClick={() =>
                              download("soa", "xlsx", profile.subscriber.id)
                            }
                          >
                            Excel
                          </button>
                        </>
                      )}
                    </div>
                    <Table
                      rows={profile.ledger}
                      columns={[
                        ["date", "Date", (r) => date(r.date)],
                        ["reference", "Reference"],
                        ["description", "Description"],
                        ["debit", "Debit", (r) => money(r.debit)],
                        ["credit", "Credit", (r) => money(r.credit)],
                        ["balance", "Balance", (r) => money(r.balance)],
                      ]}
                    />
                  </>
                )}
                {tab === "Collection" && (
                  <Table
                    rows={profile.collections}
                    columns={[
                      ["id", "Batch"],
                      ["collector", "Collector"],
                      ["status", "Status", (r) => <Badge value={r.status} />],
                      ["expected", "Route balance", (r) => money(r.expected)],
                    ]}
                  />
                )}
                {tab === "Audit" && (
                  <Table
                    rows={profile.audit}
                    columns={[
                      ["created_at", "Date", (r) => date(r.created_at)],
                      ["action", "Action"],
                      ["reason", "Reason"],
                    ]}
                  />
                )}
                {tab === "Service history" && (
                  <Table
                    rows={profile.history}
                    columns={[
                      ["created_at", "Date", (r) => date(r.created_at)],
                      ["kind", "Event"],
                      ["reason", "Reason"],
                    ]}
                  />
                )}
                {tab === "Documents" && (
                  <Table
                    rows={profile.proofs}
                    columns={[
                      ["reference", "GCash reference"],
                      ["amount", "Amount", (r) => money(r.amount)],
                      [
                        "status",
                        "Review status",
                        (r) => <Badge value={r.status} />,
                      ],
                    ]}
                  />
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
function SubscriberPicker({
  onSelect,
}: {
  onSelect?: (r: Row | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [chosen, setChosen] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(-1);
  useEffect(() => {
    if (!open || chosen) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api("/subscribers?search=" + encodeURIComponent(query.trim()))
        .then((result) => {
          if (cancelled) return;
          setOptions(result.rows.slice(0, 8));
          setTotal(result.total);
          setActive(-1);
        })
        .catch((e) => {
          if (!cancelled) {
            setOptions([]);
            setError(e.message);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, chosen]);
  const select = (subscriber: Row) => {
    setChosen(subscriber);
    setQuery(`${subscriber.name} · ${subscriber.account_no}`);
    setOpen(false);
    setOptions([]);
    setActive(-1);
    onSelect?.(subscriber);
  };
  const edit = (value: string) => {
    setQuery(value);
    setChosen(null);
    setOptions([]);
    setActive(-1);
    setError("");
    setLoading(true);
    setOpen(true);
    onSelect?.(null);
  };
  return (
    <div
      className="subscriber-picker"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <Field label="Subscriber *">
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && !chosen}
          aria-controls={listId}
          aria-activedescendant={
            open && active >= 0 ? `${listId}-${options[active]?.id}` : undefined
          }
          autoComplete="off"
          placeholder="Search subscriber name or account…"
          value={query}
          maxLength={100}
          onFocus={() => {
            if (!chosen) setOpen(true);
          }}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              if (chosen) return;
              setOpen(true);
              setActive((n) =>
                e.key === "ArrowDown"
                  ? Math.min(n + 1, options.length - 1)
                  : Math.max(n - 1, 0),
              );
            }
            if (e.key === "Enter" && open && !chosen) {
              e.preventDefault();
              const match = options[active >= 0 ? active : 0];
              if (match && !loading) select(match);
            }
          }}
          required
        />
      </Field>
      <input type="hidden" name="subscriberId" value={chosen?.id || ""} />
      {open && !chosen && (
        <div className="picker-dropdown">
          <div className="picker-caption">
            {query.trim()
              ? "Matching subscribers"
              : "Choose a subscriber or type to search"}
          </div>
          {loading ? (
            <div className="picker-message" role="status">
              Searching subscribers…
            </div>
          ) : error ? (
            <div className="picker-message red-text" role="alert">
              {error}
            </div>
          ) : (
            <>
              <div
                className="picker-results"
                role="listbox"
                id={listId}
                aria-label="Matching subscribers"
              >
                {options.map((subscriber, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={active === index}
                    id={`${listId}-${subscriber.id}`}
                    key={subscriber.id}
                    className={active === index ? "highlighted" : ""}
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => select(subscriber)}
                  >
                    <span className="picker-person">
                      <strong>{subscriber.name}</strong>
                      <small>{subscriber.account_no}</small>
                      <small className="picker-address">
                        {subscriber.address}
                      </small>
                    </span>
                    <span className="picker-balance">
                      <strong>{money(subscriber.outstanding)}</strong>
                      <small>Outstanding</small>
                    </span>
                  </button>
                ))}
              </div>
              {!options.length && (
                <div className="picker-message" role="status">
                  No subscribers found. Try another name or account number.
                </div>
              )}
              {total > options.length && (
                <div className="picker-caption">
                  Showing {options.length} of {total} matches. Keep typing to
                  narrow the list.
                </div>
              )}
            </>
          )}
        </div>
      )}
      {chosen ? (
        <div className="picker-selection">
          <span>
            <Check size={14} /> Selected: <strong>{chosen.name}</strong>
          </span>
          <button type="button" onClick={() => edit("")}>
            Change subscriber
          </button>
        </div>
      ) : (
        <p className="picker-help">
          Type any part of a name or account number, then choose a match.
        </p>
      )}
    </div>
  );
}
function PaymentForm({
  api,
  busy,
  submit,
  onDone,
}: {
  api: (p: string, b?: unknown) => Promise<any>;
  busy: boolean;
  submit: any;
  onDone: (r: Row) => Promise<void>;
}) {
  const [account, setAccount] = useState<Row | null>(null),
    [value, setValue] = useState(""),
    [key] = useState(crypto.randomUUID()),
    [selectedSubscriber, setSelectedSubscriber] = useState<Row | null>(null),
    [accountLoading, setAccountLoading] = useState(false),
    [accountError, setAccountError] = useState("");
  useEffect(() => {
    if (!selectedSubscriber) return;
    let cancelled = false;
    setAccountLoading(true);
    api("/subscribers/" + selectedSubscriber.id)
      .then((result) => {
        if (!cancelled) setAccount(result);
      })
      .catch((e) => {
        if (!cancelled) setAccountError(e.message);
      })
      .finally(() => {
        if (!cancelled) setAccountLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSubscriber, api]);
  let cents = 0;
  try {
    cents = centavos(value || "0");
  } catch {}
  const invoices =
    account?.invoices
      .filter(
        (r: Row) =>
          Number(r.balance) > 0 && !["VOID", "DRAFT"].includes(r.status),
      )
      .sort(
        (a: Row, b: Row) =>
          String(a.period).localeCompare(String(b.period)) || a.id - b.id,
      ) || [];
  const allocation = allocate(
    cents,
    invoices.map((r: Row) => ({ id: r.id, balance: Number(r.balance) })),
  );
  return (
    <form
      onSubmit={(e) =>
        submit(e, async (b: Row) => {
          if (!account || account.subscriber.id !== selectedSubscriber?.id)
            throw new Error("Select a subscriber from the search results");
          const r = await api("/payments", {
            subscriberId: account.subscriber.id,
            amount: centavos(b.amount),
            method: b.method,
            reference: b.reference,
            notes: b.notes,
            idempotencyKey: key,
            ...(b.batchId ? { batchId: Number(b.batchId) } : {}),
          });
          await onDone({ ...r, name: account.subscriber.name });
        })
      }
    >
      <div className="payment-grid">
        <div>
          <SubscriberPicker
            onSelect={(r) => {
              setAccount(null);
              setAccountError("");
              setAccountLoading(Boolean(r));
              setSelectedSubscriber(r);
            }}
          />
          {accountLoading && <p role="status">Loading subscriber balance…</p>}
          {accountError && (
            <div className="error" role="alert">
              {accountError}
            </div>
          )}
          <div className="form-grid">
            <Field label="Amount (PHP) *">
              <input
                name="amount"
                className="amount-input"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.00"
                required
                inputMode="decimal"
              />
            </Field>
            <Field label="Method *">
              <select name="method">
                <option>Cash</option>
                <option>Bank Transfer</option>
                <option>Cheque</option>
                <option>Other</option>
              </select>
            </Field>
          </div>
          <Field label="Reference number">
            <input name="reference" />
          </Field>
          <Field label="Collection batch (optional)">
            <input
              name="batchId"
              type="number"
              min="1"
              placeholder="Batch ID for field collection"
            />
          </Field>
          <Field label="Notes">
            <textarea name="notes" />
          </Field>
        </div>
        <div className="allocation">
          <div className="eyebrow">ALLOCATION PREVIEW</div>
          <h3>Oldest balance first</h3>
          <p>Server revalidates balances when posting.</p>
          {allocation.allocations.map((a) => {
            const i = invoices.find((r: Row) => r.id === a.invoiceId);
            return (
              <div className="allocation-row" key={a.invoiceId}>
                <span>
                  {i.number}
                  <small>Due {date(i.due_date)}</small>
                </span>
                <strong>{money(a.amount)}</strong>
              </div>
            );
          })}
          <div className="allocation-row">
            <span>Advance credit</span>
            <strong>{money(allocation.credit)}</strong>
          </div>
          <p>
            Unused value is retained and automatically applied to future
            invoices.
          </p>
        </div>
      </div>
      <div className="modal-actions">
        <span>
          <ShieldCheck size={15} /> Transactional posting · Unique receipt
        </span>
        <button
          className="primary"
          disabled={
            busy ||
            !account ||
            account.subscriber.id !== selectedSubscriber?.id ||
            cents <= 0
          }
        >
          {busy ? "Posting…" : "Post payment & view receipt"}
        </button>
      </div>
    </form>
  );
}
createRoot(document.getElementById("root")!).render(<App />);

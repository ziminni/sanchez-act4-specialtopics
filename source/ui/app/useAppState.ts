import React, { useState, useEffect, useCallback, useRef } from "react";
import { api, binaryApi, currentToken } from "../api/client";
import { today } from "../lib/format";
import { defaultTheme, themeStyle } from "../lib/theme";
import type { Row } from "../lib/types";

export function useAppState() {
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
    [suggestedAccountNo, setSuggestedAccountNo] = useState(""),
    [identifierToken, setIdentifierToken] = useState(""),
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
  const systemAdmin = user?.roles?.includes("Administrator");
  const collectionSupervisor =
    !systemAdmin &&
    user?.roles?.includes("Collection Supervisor") &&
    !user?.permissions?.includes("*");
  const auditor =
    !systemAdmin &&
    user?.roles?.includes("Auditor") &&
    !user?.permissions?.includes("*");
  const [correctionKind, setCorrectionKind] = useState("");
  const [ledgerId, setLedgerId] = useState<number | null>(null);
  const [navKey, setNavKey] = useState(0);
  const technician =
    !systemAdmin &&
    user?.roles?.includes("Technician") &&
    !user?.permissions?.includes("*");
  const [fieldStatus, setFieldStatus] = useState("");
  const [reconView, setReconView] = useState("pending");
  const [themeColor, setThemeColor] = useState(defaultTheme);
  const [branding, setBranding] = useState<{
    businessName: string;
    logo: string | null;
    logoVersion: string | null;
  }>({
    businessName: "Bukidnon Cable and Internet Services",
    logo: null,
    logoVersion: null,
  });
  const logoVersionRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      api("/appearance")
        .then(async (r) => {
          if (!active) return;
          setThemeColor(r.themeColor);
          let logo: string | null | undefined;
          if (r.logoVersion !== logoVersionRef.current) {
            logo = r.logoVersion ? (await api("/appearance/logo")).logo : null;
            if (!active) return;
            logoVersionRef.current = r.logoVersion;
          }
          setBranding((b) => ({
            businessName: r.businessName || b.businessName,
            logo: logo === undefined ? b.logo : logo,
            logoVersion: r.logoVersion,
          }));
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    const styles = themeStyle(themeColor);
    Object.entries(styles).forEach(([key, value]) =>
      document.documentElement.style.setProperty(key, String(value)),
    );
  }, [themeColor]);
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
    Dashboard: systemAdmin
      ? "/system/dashboard"
      : collectionSupervisor
        ? "/collections/overview"
        : auditor
          ? "/audit/overview"
          : technician
            ? "/field/overview"
            : "/dashboard",
    Subscribers: `/subscribers?search=${encodeURIComponent(search)}&page=${pageNo}${area ? "&area=" + area : ""}`,
    Billing: `/invoices?page=${pageNo}&search=${encodeURIComponent(search)}`,
    Payments: `/payments?page=${pageNo}`,
    "GCash Verification": "/proofs",
    Collections: "/batches",
    Batches: "/batches",
    "Areas & Routes": "/collections/areas",
    "Remittance & Reconciliation": "/collections/remittances",
    "Collector Performance": `/collections/performance?from=${from}&to=${to}`,
    "Service Accounts": `/field/services?search=${encodeURIComponent(search)}&status=${fieldStatus}`,
    Suspensions: "/field/suspensions",
    Reconnections: `/field/reconnections?view=${reconView}`,
    Ledger: `/ledger/subscribers?search=${encodeURIComponent(search)}`,
    "Adjustments & Reversals": `/corrections?kind=${correctionKind}&search=${encodeURIComponent(search)}&from=${from}&to=${to}`,
    Receivables: `/receivables?minDays=${arDays}${arPlan ? "&plan=" + arPlan : ""}${arType ? "&type=" + arType : ""}&page=${pageNo}${area ? "&area=" + area : ""}${collector ? "&collector=" + collector : ""}`,
    Services:
      serviceView === "reconnections"
        ? "/reconnections"
        : serviceView === "candidates"
          ? "/suspension-candidates"
          : `/services?page=${pageNo}`,
    Administration: "/users",
    "User Management": "/users",
    "Security Audit": `/security-audit?page=${pageNo}`,
    "Backup Restore": "/backups",
    "System Settings": "/system/settings",
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
    from,
    to,
    correctionKind,
    fieldStatus,
    reconView,
    navKey,
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
    // Bump so the page reloads even when its URL is unchanged (e.g. re-clicking the current page).
    setNavKey((k) => k + 1);
    setPage(p);
    setSearch("");
    setCorrectionKind("");
    setLedgerId(null);
    setFieldStatus("");
    setReconView("pending");
    setPageNo(1);
    setArea("");
    setCollector("");
    setSelected(null);
    setError("");
  };
  const openGeneratedForm = (kind: "service" | "plan") =>
    run(async () => {
      const suggestion = await api(
        `/${kind === "service" ? "services" : "plans"}/account-number`,
        {},
      );
      setSuggestedAccountNo(suggestion.account_no);
      setIdentifierToken(suggestion.token);
      setModal(kind);
    });
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
          token: currentToken(),
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
  const rows = Array.isArray(data) ? data : data?.rows || [];
  return {
    user,
    setUser,
    page,
    setPage,
    error,
    setError,
    notice,
    setNotice,
    busy,
    setBusy,
    data,
    setData,
    lookups,
    setLookups,
    search,
    setSearch,
    pageNo,
    setPageNo,
    modal,
    setModal,
    suggestedAccountNo,
    setSuggestedAccountNo,
    identifierToken,
    setIdentifierToken,
    profile,
    setProfile,
    tab,
    setTab,
    selected,
    setSelected,
    proofUrl,
    setProofUrl,
    from,
    setFrom,
    to,
    setTo,
    area,
    setArea,
    collector,
    setCollector,
    serviceView,
    setServiceView,
    arDays,
    setArDays,
    arPlan,
    setArPlan,
    arType,
    setArType,
    correctionKind,
    setCorrectionKind,
    ledgerId,
    setLedgerId,
    fieldStatus,
    setFieldStatus,
    reconView,
    setReconView,
    themeColor,
    setThemeColor,
    branding,
    setBranding,
    systemAdmin,
    collectionSupervisor,
    auditor,
    technician,
    logoVersionRef,
    can,
    run,
    routes,
    reload,
    navigate,
    openGeneratedForm,
    openProfile,
    submit,
    done,
    download,
    rows,
  };
}
export type AppState = ReturnType<typeof useAppState>;

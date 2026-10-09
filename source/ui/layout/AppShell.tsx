import { Check, X } from "lucide-react";
import { useApp } from "../app/AppContext";
import { ModalHost } from "./ModalHost";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { PageHeading } from "./PageHeading";
import { pages } from "../app/pages";

export function AppShell() {
  const { page, error, setError, notice, setNotice, data } = useApp();
  const Page = pages[page]?.Page;
  return (
    <>
      <div className="app">
        <Sidebar />
        <main>
          <Topbar />
          <div className="content">
            <PageHeading />
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
              Page && <Page />
            )}
            <footer>
              BCIS · Subscription Billing & Collection System{" "}
              <span>Centralized records. Accountable operations.</span>
            </footer>
          </div>
        </main>
        <ModalHost />
      </div>
    </>
  );
}

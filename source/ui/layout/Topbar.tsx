import { ChevronRight, RefreshCw } from "lucide-react";
import { date, today } from "../lib/format";
import { useApp } from "../app/AppContext";

export function Topbar() {
  const { user, page, run, reload } = useApp();
  if (!user) return null;
  return (
    <>
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
            {user.profile_image ? (
              <img src={user.profile_image} alt="Your profile" />
            ) : (
              user.name.slice(0, 2).toUpperCase()
            )}
          </span>
        </div>
      </header>
    </>
  );
}

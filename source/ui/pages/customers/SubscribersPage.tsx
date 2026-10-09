import { Plus } from "lucide-react";
import { money } from "../../../shared/domain";
import { api } from "../../api/client";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { ListPanel } from "../../components/ListPanel";
import { useApp } from "../../app/AppContext";

export function SubscribersPage() {
  const { lookups, setPageNo, area, setArea, openProfile, rows } = useApp();
  return (
    <>
      <ListPanel
        search="Search name, account, address, receipt…"
        exportType="subscribers"
        pageSize={25}
        filters={
          <>
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
          </>
        }
      >
        <Table
          rows={rows}
          onRow={openProfile}
          columns={[
            [
              "account_no",
              "Account",
              (r) => <span className="mono blue-text">{r.account_no}</span>,
            ],
            [
              "name",
              "Subscriber",
              (r) => (
                <div className="cell-person">
                  <span className="avatar">{r.name.slice(0, 2)}</span>
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
            ["outstanding", "Outstanding", (r) => money(r.outstanding)],
          ]}
        />
      </ListPanel>
    </>
  );
}

export function SubscribersActions() {
  const {
    busy,
    setModal,
    setSuggestedAccountNo,
    setIdentifierToken,
    can,
    run,
  } = useApp();
  return (
    <>
      {can("subscriber.edit") && (
        <button
          className="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const suggestion = await api("/subscribers/account-number", {});
              setSuggestedAccountNo(suggestion.account_no);
              setIdentifierToken(suggestion.token);
              setModal("subscriber");
            })
          }
        >
          <Plus size={17} /> New subscriber
        </button>
      )}
    </>
  );
}

import { serviceColumns } from "./shared";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function ServiceAccounts({
  rows,
  search,
  setSearch,
  status,
  setStatus,
}: {
  rows: Row[];
  search: string;
  setSearch: (v: string) => void;
  status: string;
  setStatus: (v: string) => void;
}) {
  return (
    <section className="panel admin-section">
      <div className="collection-period corrections-filters">
        <label className="corrections-search">
          Search
          <input
            value={search}
            placeholder="Account, subscriber, address, area or plan"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <label>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="TERMINATED">Terminated</option>
          </select>
        </label>
      </div>
      <Table
        rows={rows}
        columns={[
          ...serviceColumns,
          ["status", "Status", (r) => <Badge value={r.status} />],
          ["activation_date", "Activated", (r) => date(r.activation_date)],
          ["last_event", "Last service event", (r) => r.last_event || "—"],
        ]}
      />
      {rows.length === 50 && (
        <p className="admin-note">Showing the first 50. Refine your search.</p>
      )}
    </section>
  );
}

export function ServiceAccountsPage() {
  const { search, setSearch, fieldStatus, setFieldStatus, rows } = useApp();
  return (
    <>
      <ServiceAccounts
        rows={rows}
        search={search}
        setSearch={setSearch}
        status={fieldStatus}
        setStatus={setFieldStatus}
      />
    </>
  );
}

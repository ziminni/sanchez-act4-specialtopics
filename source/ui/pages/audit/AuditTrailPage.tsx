import { Table } from "../../components/Table";
import { ListPanel } from "../../components/ListPanel";
import { useApp } from "../../app/AppContext";

export function AuditTrailPage() {
  const { rows } = useApp();
  return (
    <>
      <ListPanel>
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
      </ListPanel>
    </>
  );
}

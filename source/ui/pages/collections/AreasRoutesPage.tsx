import { Plus } from "lucide-react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function AreasRoutes({
  data,
  canManage,
  openModal,
}: {
  data: Row;
  canManage: boolean;
  openModal: (modal: "area" | "collector" | "batch") => void;
}) {
  return (
    <div className="admin-dashboard">
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Collection areas / routes</h2>
            <p>
              {data.areas.length} areas · outstanding balances of billed
              subscribers
            </p>
          </div>
          {canManage && (
            <button onClick={() => openModal("area")}>
              <Plus size={15} /> Add area / route
            </button>
          )}
        </div>
        <Table
          rows={data.areas}
          columns={[
            ["name", "Area / route"],
            ["active_subscribers", "Active subscribers"],
            ["collectors", "Assigned collectors"],
            ["outstanding", "Outstanding", (r) => money(r.outstanding)],
            ["active_batches", "Active batches"],
            ["last_batch", "Last batch", (r) => date(r.last_batch)],
          ]}
        />
      </section>
      <section className="panel admin-section">
        <div className="admin-section-title">
          <div>
            <h2>Collectors</h2>
            <p>Assignments come from each subscriber's area and collector</p>
          </div>
          {canManage && (
            <div className="actions">
              <button onClick={() => openModal("collector")}>
                <Plus size={15} /> Add collector
              </button>
              <button className="primary" onClick={() => openModal("batch")}>
                <Plus size={15} /> New batch
              </button>
            </div>
          )}
        </div>
        <Table
          rows={data.collectors}
          columns={[
            ["name", "Collector"],
            [
              "active",
              "Status",
              (r) => <Badge value={r.active ? "ACTIVE" : "INACTIVE"} />,
            ],
            ["assigned", "Active subscribers"],
            ["areas", "Areas / routes"],
          ]}
        />
      </section>
    </div>
  );
}

export function AreasRoutesPage() {
  const { data, setModal, can } = useApp();
  return (
    <>
      <AreasRoutes
        data={data}
        canManage={Boolean(can("collection.manage"))}
        openModal={setModal}
      />
    </>
  );
}

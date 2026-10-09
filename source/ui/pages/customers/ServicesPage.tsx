import { money } from "../../../shared/domain";
import { api } from "../../api/client";
import { date } from "../../lib/format";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { ListPanel } from "../../components/ListPanel";
import { useApp } from "../../app/AppContext";

export function ServicesPage() {
  const {
    setNotice,
    setPageNo,
    setModal,
    setSelected,
    serviceView,
    setServiceView,
    can,
    run,
    reload,
    rows,
  } = useApp();
  return (
    <>
      <ListPanel
        filters={
          <>
            <select
              value={serviceView}
              onChange={(e) => {
                setServiceView(e.target.value);
                setPageNo(1);
              }}
            >
              <option value="accounts">Service accounts</option>
              <option value="candidates">Suspension candidates</option>
              <option value="reconnections">Reconnection requests</option>
            </select>
          </>
        }
      >
        {serviceView !== "reconnections" && (
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
        {serviceView === "reconnections" && (
          <Table
            rows={rows}
            columns={[
              ["id", "Request"],
              ["service_id", "Service ID"],
              ["requested_at", "Requested", (r) => date(r.requested_at)],
              ["completed_at", "Completed", (r) => date(r.completed_at)],
              [
                "actions",
                "",
                (r) =>
                  !r.completed_at && can("service.complete") ? (
                    <button
                      onClick={() =>
                        run(async () => {
                          await api(`/reconnections/${r.id}/complete`, {});
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
      </ListPanel>
    </>
  );
}

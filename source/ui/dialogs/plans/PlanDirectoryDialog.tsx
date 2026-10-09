import { money } from "../../../shared/domain";
import { Badge } from "../../components/Badge";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";

export function PlanDirectoryDialog() {
  const { busy, lookups, setModal, setSelected, openGeneratedForm } = useApp();
  return (
    <>
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
        <button
          className="primary"
          disabled={busy}
          onClick={() => openGeneratedForm("plan")}
        >
          Create plan
        </button>
      </>
    </>
  );
}

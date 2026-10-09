import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Table } from "../../components/Table";
import { ListPanel } from "../../components/ListPanel";
import { useApp } from "../../app/AppContext";

export function ReceivablesPage() {
  const {
    lookups,
    setPageNo,
    area,
    setArea,
    collector,
    setCollector,
    arDays,
    setArDays,
    arPlan,
    setArPlan,
    arType,
    setArType,
    can,
    openProfile,
    rows,
  } = useApp();
  return (
    <>
      <ListPanel
        exportType="aging"
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
          </>
        }
      >
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
            ["last_payment", "Last payment", (r) => date(r.last_payment)],
            [
              "outstanding",
              "Outstanding",
              (r) => <strong className="amber">{money(r.outstanding)}</strong>,
            ],
          ]}
        />
      </ListPanel>
    </>
  );
}

import { Download } from "lucide-react";
import { money } from "../../../shared/domain";
import type { Row } from "../../lib/types";
import { Table } from "../../components/Table";
import { useApp } from "../../app/AppContext";
import { RateBar, Variance, rate } from "./shared";

export function CollectorPerformance({
  data,
  from,
  to,
  setFrom,
  setTo,
  download,
}: {
  data: Row;
  from: string;
  to: string;
  setFrom: (v: string) => void;
  setTo: (v: string) => void;
  download: (type: string, format: string) => void;
}) {
  const rows: Row[] = data.rows;
  const total = (k: string) => rows.reduce((a, r) => a + Number(r[k]), 0);
  return (
    <div className="admin-dashboard">
      <section className="panel filters collection-period">
        <label>
          From
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && setFrom(e.target.value)}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && setTo(e.target.value)}
          />
        </label>
        <p className="admin-note">
          Batches created in this period. Collection rate = collected ÷ expected
          balances.
        </p>
        <div className="actions">
          <button onClick={() => download("collectors", "pdf")}>
            <Download size={15} /> Remittance report PDF
          </button>
          <button onClick={() => download("collectors", "xlsx")}>
            <Download size={15} /> Excel
          </button>
        </div>
      </section>
      <div className="admin-stat-grid">
        {[
          ["Batches", total("batches"), `${total("closed")} closed`],
          [
            "Collected",
            money(total("collected")),
            `${money(total("expected"))} expected`,
          ],
          [
            "Collection rate",
            rate(total("collected"), total("expected")) === null
              ? "—"
              : `${rate(total("collected"), total("expected"))}%`,
            "Across all collectors",
          ],
          [
            "Remittance difference",
            <Variance value={total("difference")} key="v" />,
            `${total("shortages")} short remittances`,
          ],
        ].map(([label, value, detail]) => (
          <div className="panel admin-stat" key={label as string}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
          </div>
        ))}
      </div>
      <section className="panel admin-section">
        <Table
          rows={rows}
          columns={[
            [
              "name",
              "Collector",
              (r) => (r.active ? r.name : `${r.name} (inactive)`),
            ],
            ["assigned", "Assigned"],
            ["batches", "Batches", (r) => `${r.batches} (${r.closed} closed)`],
            ["accounts", "Accounts paid"],
            ["expected", "Expected", (r) => money(r.expected)],
            ["collected_amount", "Collected", (r) => money(r.collected)],
            [
              "rate",
              "Collection rate",
              (r) => <RateBar collected={r.collected} expected={r.expected} />,
            ],
            ["remitted_cash", "Cash remitted", (r) => money(r.remitted)],
            [
              "difference",
              "Difference",
              (r) => <Variance value={r.difference} />,
            ],
            ["shortages", "Shortages"],
          ]}
        />
      </section>
    </div>
  );
}

export function CollectorPerformancePage() {
  const { data, from, setFrom, to, setTo, download } = useApp();
  return (
    <>
      <CollectorPerformance
        data={data}
        from={from}
        to={to}
        setFrom={setFrom}
        setTo={setTo}
        download={download}
      />
    </>
  );
}

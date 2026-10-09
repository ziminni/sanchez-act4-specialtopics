import React from "react";
import { FileText } from "lucide-react";
type Row = Record<string, any>;
export const date = (v: any) =>
  v
    ? new Date(v).toLocaleDateString("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
export function Badge({ value }: { value: any }) {
  return (
    <span
      className={"badge " + String(value).toLowerCase().replaceAll("_", "-")}
    >
      {String(value ?? "—").replaceAll("_", " ")}
    </span>
  );
}
export function Table({
  rows,
  columns,
  onRow,
}: {
  rows: Row[];
  columns: [string, string, ((r: Row) => React.ReactNode)?][];
  onRow?: (r: Row) => void;
}) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map(([k, label]) => (
              <th
                key={k}
                className={
                  /amount|balance|total|outstanding|cash|difference/.test(k)
                    ? "numeric"
                    : ""
                }
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr
              key={r.id ?? i}
              onClick={() => onRow?.(r)}
              className={onRow ? "clickable" : ""}
            >
              {columns.map(([k, , render]) => (
                <td
                  key={k}
                  className={
                    /amount|balance|total|outstanding|cash|difference/.test(k)
                      ? "numeric"
                      : ""
                  }
                >
                  {render ? render(r) : String(r[k] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && (
        <div className="empty">
          <FileText size={28} />
          <h3>No records to display</h3>
          <p>Records will appear here as your team works.</p>
        </div>
      )}
    </div>
  );
}

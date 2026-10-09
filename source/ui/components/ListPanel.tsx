import React from "react";
import { Download, Search } from "lucide-react";
import { useApp } from "../app/AppContext";

/** Paged list layout shared by the list pages: search, filters, export, table, pagination. */
export function ListPanel({
  search,
  filters,
  exportType,
  pageSize = 50,
  children,
}: {
  search?: string;
  filters?: React.ReactNode;
  exportType?: string;
  pageSize?: number;
  children: React.ReactNode;
}) {
  const {
    search: query,
    setSearch,
    pageNo,
    setPageNo,
    rows,
    data,
    can,
    download,
  } = useApp();
  return (
    <section className="panel">
      <div className="toolbar">
        {search ? (
          <div className="search">
            <Search size={17} />
            <input
              placeholder={search}
              value={query}
              onChange={(e) => {
                setSearch(e.target.value);
                setPageNo(1);
              }}
            />
          </div>
        ) : (
          <div />
        )}
        <div className="actions">
          {filters}
          {exportType && can("report.export") && (
            <button onClick={() => download(exportType, "xlsx")}>
              <Download size={15} /> Export
            </button>
          )}
        </div>
      </div>
      {children}
      <div className="pagination">
        <span>
          {data.total ? `${data.total} subscribers · ` : ""}Page {pageNo} ·{" "}
          {rows.length} records
        </span>
        <div className="actions">
          <button
            disabled={pageNo === 1}
            onClick={() => setPageNo((n) => n - 1)}
          >
            Previous
          </button>
          <button
            disabled={rows.length < pageSize}
            onClick={() => setPageNo((n) => n + 1)}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

import React from "react";
import { money } from "../../../shared/domain";
import { date } from "../../lib/format";
import type { Row } from "../../lib/types";
import { Badge } from "../../components/Badge";

export const kinds: Record<string, string> = {
  REVERSAL: "Payment reversal",
  ADJUSTMENT: "Invoice adjustment",
  VOID: "Invoice void",
};
export const effect = (r: Row) =>
  r.kind === "REVERSAL"
    ? "Payment reversed"
    : r.kind === "VOID"
      ? "Invoice voided"
      : Number(r.amount) < 0
        ? "Credit"
        : "Debit";
export const signed = (r: Row) => {
  const n = Number(r.amount);
  return (
    <span className={r.kind === "ADJUSTMENT" && n > 0 ? "" : "red-text"}>
      {r.kind === "ADJUSTMENT" && n > 0 ? "+" : "−"}
      {money(Math.abs(n))}
    </span>
  );
};
export const correctionColumns: [
  string,
  string,
  ((r: Row) => React.ReactNode)?,
][] = [
  ["created_at", "Date", (r) => date(r.created_at)],
  ["kind", "Type", (r) => <Badge value={r.kind} />],
  [
    "reference",
    "Receipt / invoice",
    (r) => <span className="mono">{r.reference}</span>,
  ],
  [
    "subscriber",
    "Subscriber",
    (r) => (
      <>
        {r.subscriber}
        <small className="audit-sub">{r.account_no}</small>
      </>
    ),
  ],
  ["effect", "Effect", effect],
  ["amount", "Amount", signed],
  ["actor", "Recorded by", (r) => r.actor || "Unknown user"],
  ["reason", "Reason", (r) => <span className="audit-reason">{r.reason}</span>],
];

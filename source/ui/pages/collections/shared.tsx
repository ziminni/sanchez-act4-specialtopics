import { money } from "../../../shared/domain";

export const batchNo = (id: number) => `BATCH-${String(id).padStart(4, "0")}`;
export const rate = (collected: any, expected: any) =>
  Number(expected) > 0
    ? Math.round((Number(collected) / Number(expected)) * 100)
    : null;
export const nextStep: Record<string, string> = {
  OPEN: "Submit batch",
  IN_PROGRESS: "Submit batch",
  SUBMITTED: "Record remittance",
  REMITTED: "Confirm reconciliation",
  RECONCILED: "Approve and close",
};
export function Variance({ value }: { value: any }) {
  if (value === null || value === undefined) return <>—</>;
  const n = Number(value);
  return (
    <span className={n < 0 ? "red-text" : n > 0 ? "green-text" : ""}>
      {n > 0 ? "+" : ""}
      {money(n)}
    </span>
  );
}
export function RateBar({
  collected,
  expected,
}: {
  collected: any;
  expected: any;
}) {
  const r = rate(collected, expected);
  if (r === null) return <span className="admin-note">No batches</span>;
  return (
    <div
      className="collection-rate"
      title={`${r}% of expected balances collected`}
    >
      <div>
        <i style={{ width: `${Math.min(100, r)}%` }} />
      </div>
      <span>{r}%</span>
    </div>
  );
}
export function Intro({
  icon: Icon,
  title,
  text,
}: {
  icon: any;
  title: string;
  text: string;
}) {
  return (
    <section className="admin-health">
      <div className="admin-health-icon">
        <Icon size={26} />
      </div>
      <div>
        <h2>{title}</h2>
        <p>{text}</p>
      </div>
    </section>
  );
}

export function centavos(value: string): number {
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(value))
    throw new Error("Enter a positive amount with up to two decimal places");
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(amount))
    throw new Error("Amount exceeds supported range");
  return amount;
}
export function allocate(
  amount: number,
  invoices: { id: number; balance: number }[],
) {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new Error("Invalid centavo amount");
  let credit = amount;
  const allocations = invoices
    .map((i) => {
      const applied = Math.min(credit, i.balance);
      credit -= applied;
      return { invoiceId: i.id, amount: applied };
    })
    .filter((a) => a.amount > 0);
  return { allocations, credit };
}
export function aging(due: string, today: string) {
  const days = Math.floor((Date.parse(today) - Date.parse(due)) / 86400000);
  return days <= 0
    ? "Current"
    : days <= 30
      ? "1–30"
      : days <= 60
        ? "31–60"
        : days <= 90
          ? "61–90"
          : "90+";
}
export const money = (c: number | string) =>
  new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
    Number(c) / 100,
  );
export const rolePermissions: Record<string, string[]> = {
  Owner: ["*"],
  Administrator: [
    "system.view",
    "user.manage",
    "security.view",
    "backup.restore",
    "system.settings",
  ],
  Cashier: ["subscriber.view", "payment.create", "report.view"],
  "Collection Supervisor": [
    "collection.view",
    "collection.manage",
    "collection.reconcile",
    "ledger.view",
  ],
  Auditor: [
    "subscriber.view",
    "report.view",
    "report.export",
    "payment.reverse",
    "audit.view",
  ],
  Technician: ["service.view", "service.complete"],
  Viewer: ["report.view"],
};

export function manilaDateWindow(from: string, to: string) {
  return {
    start: Date.parse(from + "T00:00:00+08:00"),
    end: Date.parse(to + "T00:00:00+08:00") + 86400000,
  };
}
export function manilaDate(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

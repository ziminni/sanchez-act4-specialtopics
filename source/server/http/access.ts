/** Roles without financial access (e.g. Technician) only receive operational service fields. */
export const seesMoney = (req: any) =>
  ["*", "subscriber.view", "report.view"].some((p) =>
    req.actor.permissions.includes(p),
  );
export const withoutMoney = (rows: any[], keys: string[]) =>
  rows.map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !keys.includes(k))),
  );

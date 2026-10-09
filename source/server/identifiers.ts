import { randomUUID } from "node:crypto";
import { type DB } from "./db.js";
const generators = {
  subscriber: "next_subscriber_account_no",
  service: "next_service_account_no",
  plan: "next_service_plan_code",
} as const;
export type IdentifierKind = keyof typeof generators;
export async function generateIdentifier(db: DB, kind: IdentifierKind) {
  return (await db.query(`SELECT ${generators[kind]}() AS value`)).rows[0]
    .value as string;
}
export async function reserveIdentifier(
  db: DB,
  kind: IdentifierKind,
  actor: number,
) {
  const value = await generateIdentifier(db, kind);
  const token = randomUUID();
  await db.query(
    "INSERT INTO identifier_reservations(token,kind,value,actor_id) VALUES($1,$2,$3,$4)",
    [token, kind, value, actor],
  );
  return { account_no: value, token };
}
export async function consumeIdentifier(
  db: DB,
  kind: IdentifierKind,
  actor: number,
  token?: string,
) {
  if (!token) return generateIdentifier(db, kind);
  const result = await db.query(
    "DELETE FROM identifier_reservations WHERE token=$1 AND kind=$2 AND actor_id=$3 RETURNING value",
    [token, kind, actor],
  );
  if (!result.rowCount)
    throw new Error(
      "Invalid or already used generated ID. Reopen the form and try again.",
    );
  return result.rows[0].value as string;
}

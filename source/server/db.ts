import "dotenv/config";
import pg from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
pg.types.setTypeParser(1082, (value) => value);
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  options: "-c timezone=Asia/Manila",
});
export const orm = drizzle(pool);
export type DB = pg.PoolClient;
export async function transaction<T>(fn: (db: DB) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const result = await fn(db);
    await db.query("COMMIT");
    return result;
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    db.release();
  }
}
export async function audit(
  db: DB,
  actor: number,
  action: string,
  entity: string,
  id: unknown,
  value: unknown,
  reason = "",
) {
  await db.query(
    "INSERT INTO audit_logs(actor_id,action,entity,entity_id,new_value,reason) VALUES($1,$2,$3,$4,$5,$6)",
    [actor, action, entity, String(id), JSON.stringify(value), reason],
  );
}

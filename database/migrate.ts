import { pool, transaction } from "../source/server/db.js";
import { readdir, readFile } from "node:fs/promises";
await transaction(async (db) => {
  await db.query("SELECT pg_advisory_xact_lock(743211)");
  await db.query(
    "CREATE TABLE IF NOT EXISTS migrations(name text PRIMARY KEY, applied_at timestamptz DEFAULT now())",
  );
  for (const name of (await readdir("database/migrations")).sort()) {
    if (
      !(await db.query("SELECT 1 FROM migrations WHERE name=$1", [name]))
        .rowCount
    ) {
      await db.query(await readFile(`database/migrations/${name}`, "utf8"));
      await db.query("INSERT INTO migrations(name) VALUES($1)", [name]);
      console.log("Applied", name);
    }
  }
});
await pool.end();

import "dotenv/config";
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const pg = new EmbeddedPostgres({
  databaseDir: "storage/dev-postgres",
  user: "bcis",
  password: process.env.LOCAL_DB_PASSWORD || "local-synthetic-data-only",
  port: 55432,
  persistent: true,
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: console.error,
});
if (!existsSync("storage/dev-postgres/PG_VERSION")) await pg.initialise();
await pg.start();
for (const name of ["bcis", "bcis_test", "bcis_restore"]) {
  try {
    await pg.createDatabase(name);
  } catch (e) {
    if (!(e as Error).message.includes("already exists")) throw e;
  }
}
console.log(
  "Local development PostgreSQL ready on 127.0.0.1:55432 (bcis, bcis_test, bcis_restore).",
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
await new Promise(() => {});

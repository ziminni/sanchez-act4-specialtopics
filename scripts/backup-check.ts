import "dotenv/config";
import { createBackup } from "../source/server/backup";
import { pool, transaction, audit } from "../source/server/db";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile } from "node:fs/promises";
import pg from "pg";
const exec = promisify(execFile);
const target = new URL(process.env.DATABASE_URL!);
if (target.hostname !== "127.0.0.1" || target.port !== "55432")
  throw new Error(
    "Restore drill is restricted to the isolated local laboratory PostgreSQL instance",
  );
const suffix = Date.now().toString();
const database = "bcis_restore_" + suffix;
const marker = "restore_drill_" + suffix;
const before = Number(
  (await pool.query("SELECT count(*) FROM subscribers")).rows[0].count,
);
const backup = await createBackup(1);
const manifest = JSON.parse(
  await readFile(`storage/backups/${backup.name}/manifest.json`, "utf8"),
);
await transaction(async (db) => {
  await db.query("INSERT INTO application_settings(key,value) VALUES($1,$2)", [
    marker,
    JSON.stringify({ createdAfterBackup: true }),
  ]);
  await audit(db, 1, "test.restore_marker", "application_settings", marker, {
    createdAfterBackup: true,
  });
});
await pool.query(`CREATE DATABASE ${database}`);
target.pathname = "/" + database;
await exec(process.execPath, [
  "--import",
  "tsx",
  "scripts/restore.ts",
  `storage/backups/${backup.name}`,
  target.href,
  `storage/restore-drill/${suffix}/attachments`,
]);
const restored = new pg.Client({ connectionString: target.href });
await restored.connect();
const after = Number(
  (await restored.query("SELECT count(*) FROM subscribers")).rows[0].count,
);
if (before !== after) throw new Error("Subscriber counts mismatch");
for (const table of ["invoices", "payments", "payment_allocations"]) {
  const a = (await pool.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n;
  const b = (await restored.query(`SELECT count(*) AS n FROM ${table}`)).rows[0]
    .n;
  if (a !== b) throw new Error(table + " count mismatch");
}
if (
  (
    await restored.query("SELECT 1 FROM application_settings WHERE key=$1", [
      marker,
    ])
  ).rowCount
)
  throw new Error("Restore incorrectly contains a change made after backup");
if (
  Number(
    (await restored.query("SELECT count(*) FROM sessions")).rows[0].count,
  ) !== 0
)
  throw new Error("Restored sessions must be invalidated");
await restored.end();
await pool.end();
await writeFile(
  "tests/backup-restore-evidence.json",
  JSON.stringify(
    {
      test: "AT-12",
      status: "PASS",
      backup: backup.name,
      sha256: backup.sha256,
      restoredDatabase: database,
      sourceSubscribers: before,
      restoredSubscribers: after,
      attachmentChecksums: Object.keys(manifest.attachments).length,
      checks: [
        "archive and attachment checksums",
        "pg_restore transaction",
        "foreign keys",
        "nonnegative invoice balances",
        "subscriber/invoice/payment/allocation counts",
        "post-backup mutation absent from restored snapshot",
        "session invalidation",
      ],
      time: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(
  "AT-12 PASS: new target restored; record counts match; post-backup change absent; sessions invalidated.",
);

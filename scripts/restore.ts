import "dotenv/config";
import { readFile, cp, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import pg from "pg";
const exec = promisify(execFile);
const [backupDir, targetUrl, targetAttachments] = process.argv.slice(2);
if (!backupDir || !targetUrl || !targetAttachments)
  throw new Error(
    "Usage: npm run restore -- <backup-directory> <empty-target-database-url> <new-attachment-directory>",
  );
const manifest = JSON.parse(
  await readFile(path.join(backupDir, "manifest.json"), "utf8"),
);
const sha256 = createHash("sha256")
  .update(await readFile(path.join(backupDir, "database.dump")))
  .digest("hex");
if (sha256 !== manifest.sha256)
  throw new Error("Backup checksum mismatch. Restore stopped.");
for (const [filename, hash] of Object.entries(manifest.attachments || {})) {
  if (path.basename(filename) !== filename)
    throw new Error("Unsafe attachment manifest path");
  if (
    createHash("sha256")
      .update(await readFile(path.join(backupDir, "attachments", filename)))
      .digest("hex") !== hash
  )
    throw new Error("Attachment checksum mismatch: " + filename);
}
const client = new pg.Client({ connectionString: targetUrl });
await client.connect();
try {
  const count = Number(
    (
      await client.query(
        "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'",
      )
    ).rows[0].count,
  );
  if (count)
    throw new Error(
      "Target database must be empty. Live databases are never overwritten.",
    );
  try {
    const files = await readdir(targetAttachments);
    if (files.length)
      throw new Error("Target attachment directory must be empty");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  const u = new URL(targetUrl);
  await exec(
    "pg_restore",
    [
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--single-transaction",
      "-h",
      u.hostname,
      "-p",
      u.port || "5432",
      "-U",
      decodeURIComponent(u.username),
      "-d",
      u.pathname.slice(1),
      path.join(backupDir, "database.dump"),
    ],
    { env: { ...process.env, PGPASSWORD: decodeURIComponent(u.password) } },
  );
  const bad = (
    await client.query(
      "SELECT count(*) FROM invoice_balances WHERE balance<0 AND status NOT IN ('VOID','DRAFT')",
    )
  ).rows[0].count;
  if (Number(bad))
    throw new Error("Restored invoice balances failed integrity check");
  await client.query("DELETE FROM sessions");
  await mkdir(targetAttachments, { recursive: true });
  await cp(path.join(backupDir, "attachments"), targetAttachments, {
    recursive: true,
  });
  console.log(
    "RESTORE VERIFIED: PostgreSQL archive, foreign keys, invoice balances, attachments. Sessions invalidated. Switch the stopped API to this database and attachment directory after review.",
  );
} finally {
  await client.end();
}

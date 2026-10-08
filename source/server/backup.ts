import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { transaction, audit } from "./db.js";
const exec = promisify(execFile);
export async function createBackup(actor: number) {
  const root = path.resolve(process.env.STORAGE_DIR || "storage");
  const name = `bcis-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`;
  const dir = path.join(root, "backups", name);
  await mkdir(dir, { recursive: true });
  const url = new URL(process.env.DATABASE_URL!);
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(url.password) };
  const args = [
    "-h",
    url.hostname,
    "-p",
    url.port || "5432",
    "-U",
    decodeURIComponent(url.username),
    "-d",
    url.pathname.slice(1),
  ];
  await exec(
    "pg_dump",
    [...args, "-Fc", "-f", path.join(dir, "database.dump")],
    { env },
  );
  await exec("pg_restore", ["--list", path.join(dir, "database.dump")], {
    env,
  });
  await mkdir(path.join(root, "attachments"), { recursive: true });
  await cp(path.join(root, "attachments"), path.join(dir, "attachments"), {
    recursive: true,
  });
  const sha256 = createHash("sha256")
    .update(await readFile(path.join(dir, "database.dump")))
    .digest("hex");
  const attachments: Record<string, string> = {};
  for (const filename of await readdir(path.join(dir, "attachments")))
    attachments[filename] = createHash("sha256")
      .update(await readFile(path.join(dir, "attachments", filename)))
      .digest("hex");
  await writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        name,
        sha256,
        attachments,
        createdAt: new Date().toISOString(),
        format: 1,
      },
      null,
      2,
    ),
  );
  return transaction(async (db) => {
    await db.query(
      "INSERT INTO backup_history(filename,sha256,status,actor_id) VALUES($1,$2,'VERIFIED_ARCHIVE',$3)",
      [name, sha256, actor],
    );
    await audit(db, actor, "backup.create", "backup_history", name, { sha256 });
    return { name, sha256 };
  });
}

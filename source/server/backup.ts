import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readFile, writeFile, cp, readdir } from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { transaction, audit, pool } from "./db.js";
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

export async function verifyBackup(id: number, actor: number) {
  const record = (
    await pool.query("SELECT * FROM backup_history WHERE id=$1", [id])
  ).rows[0];
  if (!record) throw new Error("Backup not found");
  if (path.basename(record.filename) !== record.filename)
    throw new Error("Invalid backup location");
  const dir = path.join(
    path.resolve(process.env.STORAGE_DIR || "storage"),
    "backups",
    record.filename,
  );
  let result: {
    ok: boolean;
    message: string;
    bytes?: number;
    attachments?: number;
  };
  try {
    const manifest = JSON.parse(
      await readFile(path.join(dir, "manifest.json"), "utf8"),
    );
    const dump = await readFile(path.join(dir, "database.dump"));
    const hash = createHash("sha256").update(dump).digest("hex");
    if (hash !== record.sha256 || hash !== manifest.sha256)
      throw new Error("Database checksum does not match the recorded backup.");
    if (!manifest.attachments || typeof manifest.attachments !== "object")
      throw new Error("Attachment manifest is missing.");
    let bytes = dump.length;
    for (const [filename, expected] of Object.entries(manifest.attachments)) {
      if (
        path.basename(filename) !== filename ||
        filename === "." ||
        filename === ".."
      )
        throw new Error("Invalid attachment path.");
      const content = await readFile(path.join(dir, "attachments", filename));
      if (createHash("sha256").update(content).digest("hex") !== expected)
        throw new Error("An attachment checksum does not match.");
      bytes += content.length;
    }
    if (
      (await readdir(path.join(dir, "attachments"))).length !==
      Object.keys(manifest.attachments).length
    )
      throw new Error("Attachment files differ from the manifest.");
    await exec("pg_restore", ["--list", path.join(dir, "database.dump")]);
    result = {
      ok: true,
      message:
        "Archive is readable and database and attachment checksums match.",
      bytes,
      attachments: Object.keys(manifest.attachments).length,
    };
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    result = {
      ok: false,
      message:
        code === "ENOENT"
          ? "Backup files or the PostgreSQL verification tool are unavailable on the server."
          : code === "EACCES"
            ? "The server cannot read this backup."
            : "Verification failed. The archive may be incomplete, changed, or unreadable.",
    };
  }
  await transaction(async (db) => {
    await db.query(
      "INSERT INTO audit_logs(actor_id,action,entity,entity_id,new_value,outcome) VALUES($1,'backup.verify','backup_history',$2,$3,$4)",
      [
        actor,
        String(id),
        JSON.stringify(result),
        result.ok ? "SUCCESS" : "FAILURE",
      ],
    );
  });
  return { ...result, checkedAt: new Date().toISOString() };
}

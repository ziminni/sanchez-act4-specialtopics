import { pool } from "../db.js";
import { createBackup, verifyBackup } from "../services/backup.js";
import { id } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerBackupRoutes({ get, post }: RouteContext) {
  get(
    "/backups",
    "backup.restore",
    async () =>
      (
        await pool.query(
          "SELECT b.*,u.name AS created_by,v.created_at AS verified_at,v.outcome AS verification_outcome,v.new_value AS verification FROM backup_history b LEFT JOIN users u ON u.id=b.actor_id LEFT JOIN LATERAL (SELECT created_at,outcome,new_value FROM audit_logs WHERE action='backup.verify' AND entity_id=b.id::text ORDER BY id DESC LIMIT 1) v ON true ORDER BY b.id DESC LIMIT 30",
        )
      ).rows,
  );
  post("/backups/:id/verify", "backup.restore", async (req: any) =>
    verifyBackup(id.parse(req.params.id), req.actor.id),
  );
  post("/backups", "backup.restore", async (req: any) =>
    createBackup(req.actor.id),
  );
}

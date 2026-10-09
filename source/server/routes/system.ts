import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import {
  imageBytes,
  logoVersion,
  profileFields,
  systemProfile,
} from "../services/system-profile.js";
import { text } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerSystemRoutes({ get, post }: RouteContext) {
  get("/system/dashboard", "system.view", async () =>
    transaction(async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const counts = (
        await db.query(`SELECT
      (SELECT count(*)::int FROM users) AS users,
      (SELECT count(*)::int FROM users WHERE active) AS active_users,
      (SELECT count(*)::int FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>now() AND u.active) AS sessions,
      (SELECT count(DISTINCT s.user_id)::int FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.expires_at>now() AND u.active) AS signed_in_users,
      (SELECT count(*)::int FROM backup_history) AS backups,
      (SELECT count(*)::int FROM audit_logs WHERE outcome IN ('FAILURE','DENIED') AND action LIKE 'auth.%' AND created_at >= now()-interval '24 hours') AS security_alerts`)
      ).rows[0];
      const trend = (
        await db.query(`SELECT to_char(day,'YYYY-MM-DD') AS day,
      count(a.id) FILTER (WHERE a.action='auth.login')::int AS signins,
      count(a.id) FILTER (WHERE a.outcome IN ('FAILURE','DENIED'))::int AS alerts
      FROM generate_series((now() AT TIME ZONE 'Asia/Manila')::date-6,(now() AT TIME ZONE 'Asia/Manila')::date,interval '1 day') day
      LEFT JOIN audit_logs a ON a.created_at >= (day AT TIME ZONE 'Asia/Manila') AND a.created_at < ((day+interval '1 day') AT TIME ZONE 'Asia/Manila') AND a.action LIKE 'auth.%'
      GROUP BY day ORDER BY day`)
      ).rows;
      const roles = (
        await db.query(
          "SELECT r.id AS role,count(u.id)::int AS users FROM roles r LEFT JOIN user_roles ur ON ur.role_id=r.id LEFT JOIN users u ON u.id=ur.user_id AND u.active GROUP BY r.id ORDER BY count(u.id) DESC,r.id",
        )
      ).rows;
      const recent = (
        await db.query(
          "SELECT a.id,a.created_at,a.action,a.outcome,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.action LIKE 'auth.%' OR a.action LIKE 'user.%' OR a.action LIKE 'backup.%' OR a.action LIKE 'system.%' ORDER BY a.created_at DESC,a.id DESC LIMIT 6",
        )
      ).rows;
      const latestBackup =
        (
          await db.query(
            "SELECT filename,status,created_at FROM backup_history ORDER BY id DESC LIMIT 1",
          )
        ).rows[0] ?? null;
      return {
        ...counts,
        database: "Connected",
        checkedAt: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        latestBackup,
        trend,
        roles,
        recent,
      };
    }),
  );
  get("/security-audit", "security.view", async (req: any) => {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        search: z.string().trim().max(100).default(""),
        category: z.enum(["", "auth", "user", "backup", "system"]).default(""),
        outcome: z.enum(["", "SUCCESS", "FAILURE", "DENIED"]).default(""),
        from: z.iso.date().optional(),
        to: z.iso.date().optional(),
      })
      .refine((q) => !q.from || !q.to || q.from <= q.to, {
        message: "Start date must be on or before end date",
      })
      .parse(req.query);
    const where = `WHERE (a.action LIKE 'auth.%' OR a.action LIKE 'user.%' OR a.action LIKE 'backup.%' OR a.action LIKE 'system.%')
      AND ($1='' OR concat_ws(' ',a.id::text,u.name,u.username,a.action,a.entity_id,a.source_ip,a.new_value->>'username') ILIKE '%' || $1 || '%')
      AND ($2='' OR split_part(a.action,'.',1)=$2) AND ($3='' OR a.outcome=$3)
      AND ($4::date IS NULL OR a.created_at >= ($4::date::timestamp AT TIME ZONE 'Asia/Manila'))
      AND ($5::date IS NULL OR a.created_at < (($5::date+1)::timestamp AT TIME ZONE 'Asia/Manila'))`;
    const values = [
      q.search,
      q.category,
      q.outcome,
      q.from ?? null,
      q.to ?? null,
    ];
    return transaction(async (db) => {
      await db.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
      const summary = (
        await db.query(
          `SELECT count(*)::int AS total, count(*) FILTER(WHERE a.outcome='SUCCESS')::int AS success, count(*) FILTER(WHERE a.outcome='FAILURE')::int AS failure, count(*) FILTER(WHERE a.outcome='DENIED')::int AS denied FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ${where}`,
          values,
        )
      ).rows[0];
      const rows = (
        await db.query(
          `SELECT a.id,a.created_at,a.action,a.entity,a.entity_id,a.reason,a.outcome,a.source_ip,a.request_id,u.name AS actor,u.username,
        jsonb_strip_nulls(jsonb_build_object('username',a.new_value->>'username','role',a.new_value->>'role','active',a.new_value->'active','displayName',a.new_value->>'displayName','themeColor',a.new_value->>'themeColor','hasPicture',a.new_value->'hasPicture','supportContact',a.new_value->>'supportContact','permission',a.new_value->>'permission','method',a.new_value->>'method','path',a.new_value->>'path','sha256',a.new_value->>'sha256','message',a.new_value->>'message','attachments',a.new_value->'attachments','bytes',a.new_value->'bytes')) AS details
        FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ${where} ORDER BY a.created_at DESC,a.id DESC LIMIT 25 OFFSET $6`,
          [...values, (q.page - 1) * 25],
        )
      ).rows;
      return { rows, summary, page: q.page, pageSize: 25 };
    });
  });

  get("/system/settings", "system.settings", async () => {
    const settings = await systemProfile();
    const updated =
      (
        await pool.query(
          "SELECT a.created_at,u.name AS actor FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id WHERE a.action='system.settings.update' ORDER BY a.id DESC LIMIT 1",
        )
      ).rows[0] ?? null;
    return { ...settings, updated };
  });
  post("/system/settings", "system.settings", async (req: any) => {
    const b = z
      .object({
        displayName: text,
        supportContact: z.string().trim().max(200),
        themeColor: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        businessName: profileFields.businessName.optional(),
        address: profileFields.address.optional(),
        contactNumber: profileFields.contactNumber.optional(),
        email: profileFields.email.optional(),
        tin: profileFields.tin.optional(),
      })
      .parse(req.body);
    await transaction(async (db) => {
      await db.query(
        "INSERT INTO application_settings(key,value) VALUES('system',$1) ON CONFLICT(key) DO UPDATE SET value=application_settings.value || excluded.value",
        [JSON.stringify(b)],
      );
      await audit(
        db,
        req.actor.id,
        "system.settings.update",
        "application_settings",
        "system",
        b,
      );
    });
    return systemProfile();
  });
  post("/system/logo", "system.settings", async (req: any) => {
    const b = z
      .object({ image: z.string().max(500000).nullable() })
      .parse(req.body);
    if (b.image !== null) imageBytes(b.image);
    const version = b.image === null ? null : logoVersion(b.image);
    await transaction(async (db) => {
      if (b.image === null)
        await db.query(
          "DELETE FROM application_settings WHERE key='system_logo'",
        );
      else
        await db.query(
          "INSERT INTO application_settings(key,value) VALUES('system_logo',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
          [JSON.stringify({ image: b.image, version })],
        );
      await audit(
        db,
        req.actor.id,
        "system.logo.update",
        "application_settings",
        "system_logo",
        { hasLogo: b.image !== null, version },
      );
    });
    return { logo: b.image, logoVersion: version };
  });
}

import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import { hashPassword } from "../services/auth.js";
import { id, reason, text } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerUserRoutes({ get, post }: RouteContext) {
  get(
    "/users",
    "user.manage",
    async () =>
      (
        await pool.query(
          "SELECT u.id,u.username,u.name,u.active,COALESCE(array_agg(r.role_id) FILTER(WHERE r.role_id IS NOT NULL),'{}') AS roles,(SELECT max(a.created_at) FROM audit_logs a WHERE a.actor_id=u.id AND a.action='auth.login') AS last_sign_in,(SELECT count(*)::int FROM sessions s WHERE s.user_id=u.id AND s.expires_at>now() AND u.active) AS active_sessions FROM users u LEFT JOIN user_roles r ON r.user_id=u.id GROUP BY u.id ORDER BY u.name,u.id",
        )
      ).rows,
  );
  post("/users", "user.manage", async (req: any) => {
    const b = z
      .object({
        username: text,
        name: text,
        password: z.string().min(12).max(200),
        role: z.enum([
          "Owner",
          "Administrator",
          "Cashier",
          "Collection Supervisor",
          "Auditor",
          "Technician",
          "Viewer",
        ]),
      })
      .parse(req.body);
    if (req.actor.roles.includes("Administrator") && b.role === "Owner")
      throw new Error("Only an owner can create another owner.");
    const hash = hashPassword(b.password);
    return transaction(async (db) => {
      const u = (
        await db.query(
          "INSERT INTO users(username,name,password_hash) VALUES($1,$2,$3) RETURNING id,username,name",
          [b.username, b.name, hash],
        )
      ).rows[0];
      await db.query("INSERT INTO user_roles VALUES($1,$2)", [u.id, b.role]);
      await audit(db, req.actor.id, "user.create", "users", u.id, {
        username: b.username,
        role: b.role,
      });
      return u;
    });
  });
  post("/users/:id/active", "user.manage", async (req: any) => {
    const b = z
      .object({ active: z.boolean(), reason: reason.optional() })
      .parse(req.body);
    const n = id.parse(req.params.id);
    if (n === req.actor.id && !b.active)
      throw new Error("You cannot deactivate your own account");
    return transaction(async (db) => {
      if (
        req.actor.roles.includes("Administrator") &&
        (
          await db.query(
            "SELECT 1 FROM user_roles WHERE user_id=$1 AND role_id='Owner'",
            [n],
          )
        ).rowCount
      )
        throw new Error("Only an owner can change another owner’s access.");
      const target = await db.query(
        "SELECT id FROM users WHERE id=$1 FOR UPDATE",
        [n],
      );
      if (!target.rowCount) throw new Error("User not found");
      await db.query("UPDATE users SET active=$1 WHERE id=$2", [b.active, n]);
      await db.query("DELETE FROM sessions WHERE user_id=$1", [n]);
      await audit(
        db,
        req.actor.id,
        "user.status",
        "users",
        n,
        { active: b.active },
        b.reason || "",
      );
      return { ok: true };
    });
  });
}

import type { FastifyInstance } from "fastify";
import { pool } from "../db.js";
import { tokenHash } from "../services/auth.js";
import { securityEvent } from "../services/security-audit.js";
import { rolePermissions } from "../../shared/domain.js";

declare module "fastify" {
  interface FastifyRequest {
    actor: { id: number; name: string; permissions: string[]; roles: string[] };
  }
}

/** Route registration helpers: every protected route is guarded by a permission check. */
export function createRouteContext(app: FastifyInstance) {
  const requirePermission =
    (permission: string) => async (req: any, reply: any) => {
      const token = String(req.headers.authorization || "").replace(
        /^Bearer /,
        "",
      );
      const user = (
        await pool.query(
          `SELECT u.id,u.name,u.profile_image FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active`,
          [tokenHash(token)],
        )
      ).rows[0];
      if (!user)
        return reply
          .code(401)
          .send({ error: "Your session has expired. Please sign in." });
      const roles = (
        await pool.query("SELECT role_id FROM user_roles WHERE user_id=$1", [
          user.id,
        ])
      ).rows.map((r) => r.role_id);
      let permissions = (
        await pool.query(
          "SELECT DISTINCT permission_id FROM role_permissions WHERE role_id=ANY($1::text[])",
          [roles],
        )
      ).rows.map((r) => r.permission_id);
      if (roles.includes("Administrator"))
        permissions = rolePermissions.Administrator;
      req.actor = { ...user, roles, permissions };
      if (
        permission &&
        !permissions.includes("*") &&
        !permissions.includes(permission)
      ) {
        await securityEvent(req, "auth.access_denied", "DENIED", user.id, {
          permission,
          method: req.method,
          path: req.routeOptions.url,
        });
        return reply
          .code(403)
          .send({ error: "Your role does not permit this action." });
      }
    };
  const get = (url: string, permission: string, handler: any) =>
    app.get(
      "/api" + url,
      { preHandler: requirePermission(permission) },
      handler,
    );
  const post = (url: string, permission: string, handler: any) =>
    app.post(
      "/api" + url,
      { preHandler: requirePermission(permission) },
      handler,
    );
  return { app, get, post };
}
export type RouteContext = ReturnType<typeof createRouteContext>;

import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import { verifyPassword, tokenHash } from "../services/auth.js";
import {
  imageBytes,
  systemLogo,
  systemLogoVersion,
  systemProfile,
} from "../services/system-profile.js";
import { securityEvent } from "../services/security-audit.js";
import { randomBytes } from "node:crypto";
import { text } from "../http/schemas.js";
import { seesMoney, withoutMoney } from "../http/access.js";
import type { RouteContext } from "../http/route-context.js";

export function registerSessionRoutes({ app, get, post }: RouteContext) {
  app.get("/api/appearance", async () => {
    const profile = await systemProfile();
    return {
      themeColor: profile.themeColor || "#2563eb",
      businessName: profile.businessName,
      logoVersion: await systemLogoVersion(),
    };
  });
  app.get("/api/appearance/logo", async () => ({ logo: await systemLogo() }));
  post("/me/profile-picture", "system.settings", async (req: any) => {
    const b = z
      .object({ image: z.string().max(500000).nullable() })
      .parse(req.body);
    if (b.image !== null) imageBytes(b.image);
    await transaction(async (db) => {
      await db.query("UPDATE users SET profile_image=$1 WHERE id=$2", [
        b.image,
        req.actor.id,
      ]);
      await audit(
        db,
        req.actor.id,
        "user.profile_picture",
        "users",
        req.actor.id,
        { hasPicture: b.image !== null },
      );
    });
    return { profile_image: b.image };
  });
  app.get("/api/health", async () => {
    await pool.query("SELECT 1");
    return { status: "ok", database: "connected" };
  });
  app.post(
    "/api/login",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const b = z
        .object({ username: text, password: z.string().min(1).max(200) })
        .parse(req.body);
      const u = (
        await pool.query("SELECT * FROM users WHERE username=$1 AND active", [
          b.username,
        ])
      ).rows[0];
      if (!u || !verifyPassword(b.password, u.password_hash)) {
        await securityEvent(req, "auth.login_failed", "FAILURE", null, {
          username: b.username,
          reason: "Invalid credentials",
        });
        return reply.code(401).send({ error: "Invalid username or password." });
      }
      const token = randomBytes(32).toString("hex");
      await pool.query(
        "INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '8 hours')",
        [tokenHash(token), u.id],
      );
      await securityEvent(req, "auth.login", "SUCCESS", u.id, {
        username: u.username,
      });
      return { token };
    },
  );
  get("/me", "", async (req: any) => ({
    ...req.actor,
    system: await systemProfile(),
  }));
  post("/logout", "", async (req: any) => {
    await securityEvent(req, "auth.logout", "SUCCESS", req.actor.id);
    await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
      tokenHash(req.headers.authorization.replace(/^Bearer /, "")),
    ]);
    return { ok: true };
  });
  get("/lookups", "", async (req: any) => {
    const operational = req.actor.permissions.some((p: string) =>
      ["*", "subscriber.view", "service.view", "collection.view"].includes(p),
    );
    if (req.actor.roles.includes("Administrator"))
      return { plans: [], areas: [], collectors: [] };
    return {
      plans: seesMoney(req)
        ? (await pool.query("SELECT * FROM service_plans ORDER BY id")).rows
        : withoutMoney(
            (await pool.query("SELECT * FROM service_plans ORDER BY id")).rows,
            ["price", "fee"],
          ),
      areas: (await pool.query("SELECT * FROM collection_areas ORDER BY name"))
        .rows,
      collectors: operational
        ? (await pool.query("SELECT * FROM collectors ORDER BY name")).rows
        : [],
    };
  });
}

import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import type { RouteContext } from "../http/route-context.js";

export function registerSettingRoutes({ get, post }: RouteContext) {
  get(
    "/settings",
    "billing.settings",
    async () =>
      (
        await pool.query(
          "SELECT * FROM application_settings WHERE key<>'system_logo'",
        )
      ).rows,
  );
  post("/settings", "billing.settings", async (req: any) => {
    const b = z
      .object({
        graceDays: z.number().int().min(0).max(90),
        suspensionDays: z.number().int().min(1).max(365),
      })
      .parse(req.body);
    return transaction(async (db) => {
      await db.query(
        "INSERT INTO application_settings(key,value) VALUES('service_policy',$1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        [JSON.stringify(b)],
      );
      await audit(
        db,
        req.actor.id,
        "settings.update",
        "application_settings",
        "service_policy",
        b,
      );
      return { ok: true };
    });
  });
}

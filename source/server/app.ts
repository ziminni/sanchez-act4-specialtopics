import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { registerErrorHandler } from "./http/error-handler.js";
import { createRouteContext } from "./http/route-context.js";
import { registerSessionRoutes } from "./routes/session.js";
import { registerSubscriberRoutes } from "./routes/subscribers.js";
import { registerServiceRoutes } from "./routes/services.js";
import { registerFieldRoutes } from "./routes/field.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerPaymentRoutes } from "./routes/payments.js";
import { registerProofRoutes } from "./routes/proofs.js";
import { registerCollectionRoutes } from "./routes/collections.js";
import { registerLedgerRoutes } from "./routes/ledger.js";
import { registerReportRoutes } from "./routes/reports.js";
import { registerAuditRoutes } from "./routes/audit.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerUserRoutes } from "./routes/users.js";
import { registerSettingRoutes } from "./routes/settings.js";
import { registerBackupRoutes } from "./routes/backups.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.authorization",
        "req.headers.cookie",
        "password",
        "password_hash",
      ],
    },
    bodyLimit: 1024 * 1024,
  });
  await app.register(cors, {
    origin: (process.env.UI_ORIGIN || "http://127.0.0.1:5173").split(","),
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  registerErrorHandler(app);
  const routes = createRouteContext(app);
  for (const register of [
    registerSessionRoutes,
    registerSubscriberRoutes,
    registerServiceRoutes,
    registerFieldRoutes,
    registerBillingRoutes,
    registerPaymentRoutes,
    registerProofRoutes,
    registerCollectionRoutes,
    registerLedgerRoutes,
    registerReportRoutes,
    registerAuditRoutes,
    registerSystemRoutes,
    registerUserRoutes,
    registerSettingRoutes,
    registerBackupRoutes,
  ])
    register(routes);
  return app;
}

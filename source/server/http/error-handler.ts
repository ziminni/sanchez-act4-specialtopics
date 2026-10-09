import type { FastifyInstance } from "fastify";
import { z } from "zod";

export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, req, reply) => {
    const e = err as Error & { code?: string; statusCode?: number };
    if (e instanceof z.ZodError)
      return reply.code(400).send({
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      });
    if (e.code === "23505")
      return reply.code(409).send({
        error:
          "This account, billing period, receipt, or reference already exists.",
      });
    if (e.code === "23503")
      return reply
        .code(400)
        .send({ error: "A referenced record does not exist." });
    if (e.code && /^\d{5}$/.test(e.code)) {
      req.log.error({ err: e }, "Database operation rejected");
      return reply.code(400).send({
        error:
          "The operation violates a data integrity rule. Check the record and try again.",
      });
    }
    if (e.statusCode)
      return reply.code(e.statusCode).send({ error: e.message });
    req.log.error({ err: e }, "Request failed");
    return reply.code(400).send({
      error: e.message.includes("connect")
        ? "Database unavailable. Check the server connection."
        : e.message,
    });
  });
}

import path from "node:path";
import { z } from "zod";
import { pool, transaction, audit } from "../db.js";
import { postPayment, lockSubscriber } from "../services/finance.js";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { id, amount, reason, text } from "../http/schemas.js";
import type { RouteContext } from "../http/route-context.js";

export function registerProofRoutes({ get, post }: RouteContext) {
  get(
    "/proofs",
    "payment.verify",
    async () =>
      (
        await pool.query(
          "SELECT p.*,s.name FROM payment_proofs p JOIN subscribers s ON s.id=p.subscriber_id ORDER BY p.created_at DESC LIMIT 100",
        )
      ).rows,
  );
  post("/proofs", "payment.create", async (req: any) => {
    const b = z
      .object({
        subscriberId: id,
        reference: z
          .string()
          .trim()
          .min(6)
          .max(100)
          .transform((s) => s.toUpperCase()),
        sender: text,
        amount,
      })
      .parse(req.body);
    return transaction(async (db) => {
      const r = (
        await db.query(
          "INSERT INTO payment_proofs(subscriber_id,reference,sender,amount) VALUES($1,$2,$3,$4) RETURNING *",
          [b.subscriberId, b.reference, b.sender, b.amount],
        )
      ).rows[0];
      await audit(db, req.actor.id, "proof.record", "payment_proofs", r.id, b);
      return r;
    });
  });
  post("/proofs/:id/upload", "payment.create", async (req: any) => {
    const n = id.parse(req.params.id);
    const file = await req.file();
    if (!file) throw new Error("Choose a PNG or JPEG proof image");
    const bytes = await file.toBuffer();
    const png = bytes
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const jpg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
    if (!png && !jpg)
      throw new Error("Only valid PNG and JPEG images are supported");
    const filename = randomUUID() + (png ? ".png" : ".jpg");
    const dir = path.resolve(
      process.env.STORAGE_DIR || "storage",
      "attachments",
    );
    await mkdir(dir, { recursive: true });
    return transaction(async (db) => {
      const p = (
        await db.query("SELECT * FROM payment_proofs WHERE id=$1 FOR UPDATE", [
          n,
        ])
      ).rows[0];
      if (!p || p.status !== "PENDING")
        throw new Error("Only pending proofs can receive attachments");
      await writeFile(path.join(dir, filename), bytes, { flag: "wx" });
      await db.query("UPDATE payment_proofs SET path=$1,mime=$2 WHERE id=$3", [
        filename,
        png ? "image/png" : "image/jpeg",
        n,
      ]);
      await audit(db, req.actor.id, "proof.upload", "payment_proofs", n, {
        filename,
      });
      return { ok: true };
    });
  });
  get("/proofs/:id/image", "payment.verify", async (req: any, reply: any) => {
    const p = (
      await pool.query("SELECT path,mime FROM payment_proofs WHERE id=$1", [
        id.parse(req.params.id),
      ])
    ).rows[0];
    if (!p?.path)
      return reply.code(404).send({ error: "No proof image uploaded" });
    return reply
      .type(p.mime)
      .send(
        await readFile(
          path.resolve(
            process.env.STORAGE_DIR || "storage",
            "attachments",
            path.basename(p.path),
          ),
        ),
      );
  });
  post("/proofs/:id/review", "payment.verify", async (req: any) => {
    const b = z
      .object({ decision: z.enum(["VERIFIED", "REJECTED"]), reason })
      .parse(req.body);
    return transaction(async (db) => {
      const initial = (
        await db.query("SELECT * FROM payment_proofs WHERE id=$1", [
          id.parse(req.params.id),
        ])
      ).rows[0];
      if (!initial) throw new Error("Proof not found");
      await lockSubscriber(db, initial.subscriber_id);
      const p = (
        await db.query("SELECT * FROM payment_proofs WHERE id=$1 FOR UPDATE", [
          initial.id,
        ])
      ).rows[0];
      if (p.status !== "PENDING") throw new Error("Proof was already reviewed");
      if (b.decision === "VERIFIED" && !p.path)
        throw new Error("Upload the proof image before verification");
      await db.query(
        "UPDATE payment_proofs SET status=$1,reviewed_by=$2,reviewed_at=now(),reason=$3 WHERE id=$4",
        [b.decision, req.actor.id, b.reason, p.id],
      );
      await audit(
        db,
        req.actor.id,
        "proof.review",
        "payment_proofs",
        p.id,
        b,
        b.reason,
      );
      if (b.decision === "VERIFIED")
        return postPayment(
          db,
          {
            subscriberId: p.subscriber_id,
            amount: Number(p.amount),
            method: "GCash",
            reference: p.reference,
            proofId: p.id,
            idempotencyKey: randomUUID(),
          },
          req.actor.id,
        );
      return { ok: true };
    });
  });
}

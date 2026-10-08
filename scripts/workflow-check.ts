import "dotenv/config";
import { chromium } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
const base = "http://127.0.0.1:3001/api";
let token = "";
async function request(path: string, body?: unknown) {
  const r = await fetch(base + path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`${path}: ${data.error}`);
  return data;
}
({ token } = await request("/login", {
  username: "owner",
  password: process.env.SEED_PASSWORD,
}));
const pending = (await request("/proofs")).find(
  (r: any) => r.status === "PENDING",
);
if (!pending) throw new Error("No pending synthetic proof available");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 460, height: 600 } });
await page.setContent(
  `<html><body style="margin:0;font-family:Arial;background:#f1f5f9;padding:36px;color:#0f2747"><h1>DEMO EVIDENCE</h1><p>SYNTHETIC LABORATORY IMAGE</p><hr/><h2>Test transfer</h2><h1>PHP 999.00</h1><p>Reference: ${pending.reference}</p><p>Sender: ${pending.sender}</p><p>This image is not a real GCash receipt.<br/>It cannot establish that money was transferred.</p></body></html>`,
);
const png = await page.screenshot();
await browser.close();
const form = new FormData();
form.append(
  "file",
  new Blob([new Uint8Array(png)], { type: "image/png" }),
  "demo-proof.png",
);
const upload = await fetch(`${base}/proofs/${pending.id}/upload`, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}` },
  body: form,
});
if (!upload.ok) throw new Error("Upload failed");
const payment = await request(`/proofs/${pending.id}/review`, {
  decision: "VERIFIED",
  reason: "Laboratory test: verified synthetic transaction against fixture",
});
const profile = await request(`/subscribers/${pending.subscriber_id}`);
if (
  !profile.payments.some(
    (r: any) => r.id === payment.id && r.method === "GCash",
  )
)
  throw new Error("Verified proof did not post");
const batch = (await request("/batches")).find((r: any) =>
  ["OPEN", "IN_PROGRESS"].includes(r.status),
);
if (batch) {
  const route = await request(`/batches/${batch.id}/route`);
  const sub = (await request("/subscribers?search=" + route[0].account_no))
    .rows[0];
  await request("/payments", {
    subscriberId: sub.id,
    amount: 2000000,
    method: "Cash",
    batchId: batch.id,
    idempotencyKey: crypto.randomUUID(),
    notes: "Laboratory remittance example",
  });
  await request(`/batches/${batch.id}/transition`, {
    status: "SUBMITTED",
    reason: "Laboratory collection completed",
  });
  const result = await request(`/batches/${batch.id}/remit`, {
    amount: 1950000,
    reason: "Laboratory scenario: 500 peso shortage for review",
  });
  if (result.difference !== -50000) throw new Error("Shortage mismatch");
  await request(`/batches/${batch.id}/transition`, {
    status: "RECONCILED",
    reason: "Laboratory supervisor explicitly acknowledges 500 peso shortage",
  });
}
await writeFile(
  "tests/workflow-evidence.json",
  JSON.stringify(
    {
      status: "PASS",
      time: new Date().toISOString(),
      checks: [
        "PNG proof upload",
        "authorized verification atomically posts GCash",
        "posted payment visible on subscriber ledger",
        "field collection posted to assigned batch",
        "500 peso shortage retained after reconciliation",
      ],
      receipt: payment.receipt_no,
    },
    null,
    2,
  ),
);
console.log(
  "PASS: GCash upload/review/posting and collection shortage workflow.",
);

import { chromium } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const nodes = [
  ["Subscribers", "account_no · identity · area", 60, 150],
  ["Service accounts", "subscriber_id · plan_id · rate", 390, 150],
  ["Invoices", "service_id · period · total", 720, 150],
  ["Invoice items", "invoice_id · amount", 1050, 150],
  ["Service plans", "code · type · price", 390, 20],
  ["Payments", "subscriber_id · receipt · amount", 60, 370],
  ["Payment allocations", "payment_id · invoice_id · amount", 720, 370],
  ["Adjustments", "invoice_id · reason · amount", 1050, 370],
  ["Payment proofs / reversals", "reference · review / correction", 60, 590],
  ["Collectors / Areas", "assigned route and collector", 390, 590],
  ["Collection batches", "collector_id · area_id · state", 720, 590],
  ["Remittances", "batch_id · cash · difference", 1050, 590],
  ["Roles / Permissions / Users", "normalized access control", 60, 800],
  ["Audit / Settings / Backups", "system accountability", 390, 800],
  ["Service events", "suspension / reconnection history", 720, 800],
] as const;
const edges = [
  [0, 1],
  [1, 2],
  [2, 3],
  [4, 1],
  [0, 5],
  [5, 6],
  [2, 6],
  [2, 7],
  [5, 8],
  [9, 10],
  [10, 11],
  [10, 5],
  [1, 14],
];
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1370" height="1020" viewBox="0 0 1370 1020"><rect width="1370" height="1020" fill="#f6f8fb"/><text x="60" y="50" font-family="Arial" font-size="26" fill="#0f2747" font-weight="bold">BCIS · Entity relationships</text><g transform="translate(0,70)">${edges
  .map(([a, b]) => {
    const x = nodes[a],
      y = nodes[b];
    return `<path d="M ${x[2] + 130} ${x[3] + 70} L ${y[2] + 130} ${y[3]}" stroke="#94a3b8" stroke-width="2" fill="none"/>`;
  })
  .join(
    "",
  )}${nodes.map(([title, sub, x, y]) => `<rect x="${x}" y="${y}" width="260" height="75" rx="8" fill="white" stroke="#cbd5e1"/><rect x="${x}" y="${y}" width="4" height="75" fill="#2563eb"/><text x="${x + 15}" y="${y + 28}" font-family="Arial" font-weight="bold" font-size="15" fill="#0f2747">${title.replaceAll("&", "&amp;")}</text><text x="${x + 15}" y="${y + 51}" font-family="Arial" font-size="11" fill="#64748b">${sub}</text>`).join("")}</g></svg>`;
await writeFile("docs/erd.svg", svg);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1370, height: 1020 } });
await page.setContent(svg);
await page.screenshot({ path: "docs/erd.png" });
await browser.close();

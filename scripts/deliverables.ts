import "dotenv/config";
import PDFDocument from "pdfkit";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { exportReport } from "../source/server/reports";
import { pool } from "../source/server/db";
async function document(input: string, output: string) {
  const text = await readFile(input, "utf8");
  const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (b) => chunks.push(b));
  const done = new Promise<void>((resolve) =>
    doc.on("end", async () => {
      await writeFile(output, Buffer.concat(chunks));
      resolve();
    }),
  );
  for (const raw of text.split("\n")) {
    const line = raw
      .replaceAll("→", " -> ")
      .replaceAll("₱", "PHP ")
      .replace(/[–—]/g, "-");
    if (!line.trim()) {
      doc.moveDown(0.4);
      continue;
    }
    const heading = line.startsWith("#");
    const level = line.startsWith("###") ? 3 : line.startsWith("##") ? 2 : 1;
    if (heading) {
      if (doc.y > 700) doc.addPage();
      doc
        .font("Helvetica-Bold")
        .fontSize(level === 1 ? 24 : 15)
        .fillColor("#0F2747")
        .text(line.replace(/^#+ /, ""), { paragraphGap: 12 });
    } else
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#334155")
        .text(line, { lineGap: 4, paragraphGap: 5 });
  }
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc
      .fontSize(8)
      .fillColor("#64748B")
      .text(
        `BCIS | Laboratory documentation | ${i + 1} / ${range.count}`,
        50,
        doc.page.height - 30,
        { lineBreak: false },
      );
  }
  doc.end();
  await done;
}
await document(
  "docs/technical-documentation.md",
  "docs/technical-documentation.pdf",
);
await document("docs/user-manual.md", "docs/user-manual.pdf");
await document(
  "tests/acceptance-status.md",
  "tests/acceptance-test-report.pdf",
);
for (const type of [
  "collections",
  "aging",
  "collectors",
  "revenue",
  "subscribers",
  "reversals",
  "soa",
])
  for (const format of ["pdf", "xlsx"] as const) {
    await writeFile(
      `reports-samples/${type}.${format}`,
      await exportReport(type, {
        format,
        from: "2026-01-01",
        to: "2026-12-31",
        subscriberId: 1,
      }),
    );
  }
await pool.end();
console.log(
  "Created 3 documentation PDFs and 7 matching PDF/XLSX report samples.",
);

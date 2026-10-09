import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { pool, transaction } from "../db.js";
import { ledger } from "./finance.js";
import { manilaDateWindow, manilaDate } from "../../shared/domain.js";
import { imageBytes, systemLogo, systemProfile } from "./system-profile.js";
export async function reportData(
  type: string,
  q: { from: string; to: string; subscriberId?: number },
): Promise<any[]> {
  const dates = [q.from, q.to];
  switch (type) {
    case "collections":
      return (
        await pool.query(
          "SELECT paid_at::date AS date,method,count(*) AS receipts,sum(amount)/100.0 AS pesos FROM payments WHERE NOT reversed AND paid_at>=$1::date AND paid_at<$2::date+1 GROUP BY paid_at::date,method ORDER BY date",
          dates,
        )
      ).rows;
    case "aging":
      return (
        await pool.query(
          `SELECT s.account_no,s.name,CASE WHEN due_date>=CURRENT_DATE THEN 'Current' WHEN CURRENT_DATE-due_date<=30 THEN '1-30' WHEN CURRENT_DATE-due_date<=60 THEN '31-60' WHEN CURRENT_DATE-due_date<=90 THEN '61-90' ELSE '90+' END AS bucket,sum(balance)/100.0 AS pesos FROM invoice_balances i JOIN subscribers s ON s.id=i.subscriber_id WHERE balance>0 AND i.status NOT IN ('VOID','DRAFT') GROUP BY s.id,bucket ORDER BY s.name`,
        )
      ).rows;
    case "subscribers":
      return (
        await pool.query(
          "SELECT account_no,name,contact,address,status FROM subscribers ORDER BY name",
        )
      ).rows;
    case "soa":
      if (!q.subscriberId)
        throw new Error("Select a subscriber for the statement");
      return transaction(async (db) => {
        const rows = await ledger(db, q.subscriberId!);
        const window = manilaDateWindow(q.from, q.to);
        const before = rows.filter(
          (r) => new Date(r.date).getTime() < window.start,
        );
        const opening = before.at(-1)?.balance || 0;
        return [
          {
            date: q.from,
            reference: "OPENING",
            description: "Opening balance",
            debit: 0,
            credit: 0,
            balance: opening / 100,
          },
          ...rows
            .filter(
              (r) =>
                new Date(r.date).getTime() >= window.start &&
                new Date(r.date).getTime() < window.end,
            )
            .map((r) => ({
              ...r,
              debit: Number(r.debit) / 100,
              credit: Number(r.credit) / 100,
              balance: r.balance / 100,
            })),
        ];
      });
    case "collectors":
      return (
        await pool.query(
          "SELECT b.id,c.name,b.status,r.expected_cash/100.0 AS cash,r.remitted_cash/100.0 AS remitted,r.difference/100.0 AS difference,r.notes FROM collection_batches b JOIN collectors c ON c.id=b.collector_id LEFT JOIN collector_remittances r ON r.batch_id=b.id WHERE b.created_at>=$1::date AND b.created_at<$2::date+1 ORDER BY b.id",
          dates,
        )
      ).rows;
    case "revenue":
      return (
        await pool.query(
          "SELECT p.name,p.type,count(*) AS invoices,sum(i.total)/100.0 AS billed FROM invoices i JOIN service_accounts s ON s.id=i.service_id JOIN service_plans p ON p.id=s.plan_id WHERE i.period>=$1::date AND i.period<=$2::date AND i.status NOT IN ('VOID','DRAFT') GROUP BY p.id ORDER BY p.name",
          dates,
        )
      ).rows;
    case "reversals":
      return (
        await pool.query(
          "SELECT r.created_at::date AS date,p.receipt_no,p.amount/100.0 AS pesos,r.reason,u.name AS actor FROM payment_reversals r JOIN payments p ON p.id=r.payment_id JOIN users u ON u.id=r.actor_id WHERE r.created_at>=$1::date AND r.created_at<$2::date+1 ORDER BY r.created_at",
          dates,
        )
      ).rows;
    default:
      throw new Error("Unknown report");
  }
}
export async function exportReport(
  type: string,
  q: {
    format: "pdf" | "xlsx";
    from: string;
    to: string;
    subscriberId?: number;
  },
) {
  if (q.from > q.to) throw new Error("Start date must not be after end date");
  const monetary = new Set([
    "pesos",
    "cash",
    "remitted",
    "difference",
    "billed",
    "debit",
    "credit",
    "balance",
  ]);
  const rows = (await reportData(type, q)).map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        value instanceof Date
          ? manilaDate(value)
          : monetary.has(key) && value !== null
            ? Number(value)
            : value,
      ]),
    ),
  );
  const keys = Object.keys(rows[0] || { result: "" });
  const profile = await systemProfile();
  const title = `${profile.businessName} | ${type.toUpperCase()}`;
  const details = [
    profile.address,
    profile.contactNumber,
    profile.email,
    profile.tin && `TIN ${profile.tin}`,
  ]
    .filter(Boolean)
    .join("  |  ");
  if (q.format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = profile.businessName;
    wb.company = profile.businessName;
    wb.title = title;
    const ws = wb.addWorksheet(type);
    ws.columns = keys.map((k) => ({
      header: k.replaceAll("_", " ").toUpperCase(),
      key: k,
      width: k === "description" || k === "address" || k === "notes" ? 40 : 22,
    }));
    for (const row of rows) ws.addRow(row);
    for (const key of keys)
      if (monetary.has(key))
        ws.getColumn(key).numFmt = "#,##0.00;[Red](#,##0.00)";
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F2747" },
    };
    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: { row: 1, column: keys.length } };
    return Buffer.from(await wb.xlsx.writeBuffer());
  }
  const storedLogo = await systemLogo();
  let logo: Buffer | null = null;
  try {
    logo = storedLogo ? imageBytes(storedLogo) : null;
  } catch {
    logo = null;
  }
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      layout: "landscape",
      margin: 35,
      bufferPages: true,
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const width = (doc.page.width - 70) / keys.length;
    let y = 0;
    const header = () => {
      const x = logo ? 85 : 35;
      if (logo) doc.image(logo, 35, 26, { fit: [42, 42] });
      doc
        .font("Helvetica-Bold")
        .fontSize(18)
        .fillColor("#0F2747")
        .text(title, x, 26, {
          width: doc.page.width - x - 35,
          height: 22,
          ellipsis: true,
        });
      doc.font("Helvetica").fontSize(8).fillColor("#64748B");
      if (details)
        doc.text(details, x, 50, {
          width: doc.page.width - x - 35,
          lineBreak: false,
          ellipsis: true,
        });
      doc
        .fontSize(9)
        .text(
          `${q.from} to ${q.to}  |  PHP  |  ${rows.length} records`,
          x,
          details ? 63 : 57,
        );
      y = 82;
      doc.rect(35, y, doc.page.width - 70, 26).fill("#0F2747");
      keys.forEach((k, i) =>
        doc
          .fillColor("white")
          .fontSize(8)
          .text(k.replaceAll("_", " ").toUpperCase(), 40 + i * width, y + 8, {
            width: width - 10,
            align: monetary.has(k) ? "right" : "left",
          }),
      );
      y += 32;
    };
    header();
    for (const row of rows) {
      const values = keys.map((k) =>
        row[k] instanceof Date
          ? new Intl.DateTimeFormat("en-CA", {
              timeZone: "Asia/Manila",
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
            }).format(row[k])
          : monetary.has(k) && row[k] !== null
            ? Number(row[k]).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })
            : String(row[k] ?? "—"),
      );
      doc.font("Helvetica").fontSize(8);
      const height = Math.max(
        25,
        ...values.map((v) => doc.heightOfString(v, { width: width - 10 }) + 12),
      );
      if (y + height > doc.page.height - 45) {
        doc.addPage();
        header();
      }
      values.forEach((v, i) =>
        doc.fillColor("#0F172A").text(v, 40 + i * width, y + 4, {
          width: width - 10,
          align: monetary.has(keys[i]) ? "right" : "left",
        }),
      );
      doc
        .moveTo(35, y + height)
        .lineTo(doc.page.width - 35, y + height)
        .strokeColor("#E2E8F0")
        .stroke();
      y += height;
    }
    if (!rows.length)
      doc
        .fillColor("#64748B")
        .text("No records in the selected period.", 40, y + 10);
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc
        .fontSize(8)
        .fillColor("#64748B")
        .text(
          `${profile.businessName} · Page ${i + 1} of ${range.count}`,
          35,
          doc.page.height - 30,
          { lineBreak: false },
        );
    }
    doc.end();
  });
}

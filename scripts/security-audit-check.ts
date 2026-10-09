import "dotenv/config";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1080 },
  });
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page
    .getByRole("button", { name: "Security Audit", exact: true })
    .click();
  await page
    .getByRole("button", { name: /View event/ })
    .first()
    .waitFor();
  await page.screenshot({
    path: "tests/screenshots/security-audit.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: /View event/ })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Security event details" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close event details" }).click();
  await page.getByLabel("Category", { exact: true }).selectOption("auth");
  await page.getByLabel("Outcome", { exact: true }).selectOption("SUCCESS");
  await expect(
    page.getByRole("cell", { name: "Signed in Authentication" }).first(),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export this page" }).click();
  expect((await download).suggestedFilename()).toContain("security-audit");
  await page.getByLabel("Search events").fill("no-matching-audit-event-xyz");
  await expect(
    page.getByText("No matching events", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("button", { name: /View event/ })
    .first()
    .waitFor();
  await page.getByLabel("From", { exact: true }).fill("2026-10-10");
  await page.getByLabel("To", { exact: true }).fill("2026-10-01");
  await expect(
    page.getByText("Start date must be on or before end date.", {
      exact: true,
    }),
  ).toBeVisible();
  console.log(
    "PASS: audit filters, detail view, CSV export, empty state and date validation.",
  );
} finally {
  await browser.close();
}

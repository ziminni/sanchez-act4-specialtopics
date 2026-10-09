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
    .locator("nav")
    .getByRole("button", { name: "Backup Restore", exact: true })
    .click();
  await page.getByRole("heading", { name: "Backup history" }).waitFor();
  await page.screenshot({
    path: "tests/screenshots/backup-restore.png",
    fullPage: true,
  });
  await page.getByLabel("Search backups").fill("no-backup-match-xyz");
  await expect(
    page.getByText("No matching backups", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("button", { name: /View backup/ })
    .first()
    .click();
  await expect(
    page.getByText("Database SHA-256", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Verify backup now" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Close backup details" }).click();
  await page.getByRole("button", { name: "View restore guide" }).click();
  await expect(
    page.getByText(
      "This guide does not start a restore. The script validates checksums and refuses nonempty targets.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close backup details" }).click();
  await page.getByLabel("Verification status").selectOption("Needs attention");
  await expect(
    page.getByText("No matching backups", { exact: true }),
  ).toBeVisible();
  console.log(
    "PASS: backup history search, details, verification control and offline restore guide. No restore performed.",
  );
} finally {
  await browser.close();
}

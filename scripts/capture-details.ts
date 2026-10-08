import "dotenv/config";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.goto("http://127.0.0.1:5173");
await page.getByLabel("Username", { exact: true }).fill("owner");
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.SEED_PASSWORD!);
await page.getByRole("button", { name: "Sign in to workspace" }).click();
await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
await page
  .locator("nav")
  .getByRole("button", { name: "Collections", exact: true })
  .click();
await page
  .locator("tbody tr")
  .filter({ hasText: "RECONCILED" })
  .getByRole("button", { name: "Open batch" })
  .click();
await page.getByRole("dialog").waitFor();
await page.screenshot({
  path: "tests/screenshots/collector-reconciliation.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Close", exact: true }).click();
await page
  .locator("nav")
  .getByRole("button", { name: "Payments", exact: true })
  .click();
await page.locator("tbody tr").first().getByRole("button").first().click();
await page.getByRole("dialog").waitFor();
await page.screenshot({
  path: "tests/screenshots/receipt.png",
  fullPage: true,
});
await browser.close();
console.log("Captured collector reconciliation and receipt.");

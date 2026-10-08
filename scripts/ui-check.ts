import "dotenv/config";
import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", (e) => {
  errors.push(e.message);
  console.error("Browser:", e.message);
});
await page.goto("http://127.0.0.1:5173");
await page.getByLabel("Username", { exact: true }).fill("owner");
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.SEED_PASSWORD!);
await page.getByRole("button", { name: "Sign in to workspace" }).click();
await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
await page.getByText("Recent payments", { exact: true }).waitFor();
await page.screenshot({
  path: "tests/screenshots/dashboard.png",
  fullPage: true,
});
for (const name of [
  "Subscribers",
  "Billing",
  "Payments",
  "GCash Verification",
  "Collections",
  "Receivables",
  "Services",
  "Reports",
  "Administration",
  "Audit Trail",
]) {
  await page.locator("nav").getByRole("button", { name, exact: true }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
  await page.waitForTimeout(450);
  if (await page.locator('[role="alert"]').count())
    throw new Error(
      `${name}: ${await page.locator('[role="alert"]').innerText()}`,
    );
  await page.screenshot({
    path: `tests/screenshots/${name.toLowerCase().replaceAll(" ", "-")}.png`,
    fullPage: true,
  });
}
await page
  .locator("nav")
  .getByRole("button", { name: "Subscribers", exact: true })
  .click();
await page.waitForTimeout(700);

await page.locator("tbody tr").first().click();
await page.getByRole("dialog").waitFor();
await page.getByRole("button", { name: "Ledger", exact: true }).click();
await page.screenshot({
  path: "tests/screenshots/subscriber-ledger.png",
  fullPage: true,
});
await page.getByRole("button", { name: "Close", exact: true }).click();
await page
  .locator("nav")
  .getByRole("button", { name: "Payments", exact: true })
  .click();
await page
  .getByRole("button", { name: "Receive payment", exact: true })
  .click();
await page
  .getByPlaceholder("Search subscriber name or account…")
  .fill("BCIS-00045");
await page.locator(".picker-results button").first().click();
await page.getByLabel("Amount (PHP) *", { exact: true }).fill("500");
await page.waitForTimeout(300);
await page.screenshot({
  path: "tests/screenshots/receive-payment.png",
  fullPage: true,
});
if (errors.length) throw new Error(errors.join("\n"));
await import("node:fs/promises").then((fs) =>
  fs.writeFile(
    "tests/ui-evidence.json",
    JSON.stringify(
      {
        status: "PASS",
        time: new Date().toISOString(),
        screens: 10,
        checks: [
          "login",
          "navigation including return from audit",
          "subscriber ledger",
          "payment preview",
          "no browser exceptions",
        ],
      },
      null,
      2,
    ),
  ),
);
console.log(
  "UI PASS: login, 10 navigation screens, subscriber ledger, payment preview; no browser exceptions.",
);
await browser.close();

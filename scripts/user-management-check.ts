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
    .getByRole("button", { name: "User Management", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage cashier", exact: true })
    .waitFor();
  await page.screenshot({
    path: "tests/screenshots/user-management.png",
    fullPage: true,
  });
  await page.getByLabel("Search users", { exact: true }).fill("cashier");
  await expect(page.getByRole("button", { name: /^Manage / })).toHaveCount(1);
  await page
    .getByRole("button", { name: "Manage cashier", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Deactivate account", exact: true })
    .click();
  await expect(page.getByLabel("Reason for access change")).toBeVisible();
  await expect(page.getByText(/existing sessions will end/)).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Close user details" }).click();
  await page
    .getByLabel("Search users", { exact: true })
    .fill("no-user-matches-xyz");
  await expect(
    page.getByText("No matching users", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by role").selectOption("Owner");
  await page.getByRole("button", { name: "Manage owner", exact: true }).click();
  await expect(
    page.getByText("Only an Owner can change this account’s access.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deactivate account", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Close user details" }).click();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByLabel("Filter by status").selectOption("inactive");
  await expect(page.getByRole("button", { name: /^Manage / })).toHaveCount(0);
  console.log(
    "PASS: user directory search, role/status filters, confirmation, cancel and Owner protection. No account status changed.",
  );
} finally {
  await browser.close();
}

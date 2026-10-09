import "dotenv/config";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page
    .getByRole("heading", { name: "System dashboard", exact: true })
    .waitFor();
  const sections = [
    "Dashboard",
    "User Management",
    "Security Audit",
    "Backup Restore",
    "System Settings",
  ];
  await expect(page.locator("nav button")).toHaveText(sections);
  await expect(
    page.getByText("API responding · Database connected", { exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "tests/screenshots/admin-system-dashboard.png",
    fullPage: true,
  });
  for (const section of sections.slice(1)) {
    await page
      .locator("nav")
      .getByRole("button", { name: section, exact: true })
      .click();
    await page.getByRole("heading", { name: section, exact: true }).waitFor();
    await expect(page.getByText("Connecting to your workspace…")).toHaveCount(
      0,
    );
    await expect(page.locator(".error.banner")).toHaveCount(0);
    if (section === "User Management") {
      await page
        .getByRole("button", { name: "Add team member", exact: true })
        .click();
      await expect(
        page.locator('select[name="role"] option'),
      ).not.toContainText(["Owner"]);
      await page.getByRole("button", { name: "Close", exact: true }).click();
    }
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS: Admin has exactly five system sections, a system-only dashboard and working management pages.",
  );
} finally {
  await browser.close();
}

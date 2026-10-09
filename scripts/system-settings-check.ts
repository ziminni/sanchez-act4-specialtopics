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
    .getByRole("button", { name: "System Settings", exact: true })
    .click();
  const name = page.getByLabel("System display name", { exact: false });
  await name.waitFor();
  const original = await name.inputValue();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await name.fill("Preview workspace");
  await expect(page.locator(".settings-preview-card>strong")).toHaveText(
    "Preview workspace",
  );
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await expect(name).toHaveValue(original);
  await name.fill("   ");
  await expect(
    page.getByText("Enter a display name.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Discard changes" }).click();
  await page.screenshot({
    path: "tests/screenshots/system-settings.png",
    fullPage: true,
  });
  console.log(
    "PASS: settings preview, validation, dirty state and discard. Persistence verified separately in test database.",
  );
} finally {
  await browser.close();
}

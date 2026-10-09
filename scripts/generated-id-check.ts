import "dotenv/config";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page.getByRole("button", { name: "Subscribers", exact: true }).click();
  await page
    .getByRole("button", { name: "New subscriber", exact: true })
    .click();
  const check = async (prefix: string) => {
    const field = page.locator("input.generated-id");
    await expect(field).toHaveValue(new RegExp(`^${prefix}-\\d+$`));
    await expect(field).toBeDisabled();
    await expect(field).toHaveCSS("background-color", "rgb(237, 240, 243)");
    await expect(field).toHaveCSS("pointer-events", "none");
  };
  await check("BCIS");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("row").filter({ hasText: "Amara Demo Cruz" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Services", exact: true })
    .click();
  await page.getByRole("button", { name: "Add service", exact: true }).click();
  await check("SVC");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page
    .getByRole("button", { name: "Administration", exact: true })
    .click();
  await page.getByRole("button", { name: "Manage plans", exact: true }).click();
  await page.getByRole("button", { name: "Create plan", exact: true }).click();
  await check("PLAN");
  console.log(
    "PASS: subscriber, service and plan IDs are generated, disabled, gray and non-clickable.",
  );
} finally {
  await browser.close();
}

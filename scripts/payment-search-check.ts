import "dotenv/config";
import { chromium, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).fill("owner");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Receive payment", exact: true })
    .click();
  const search = page.getByRole("combobox", { name: "Subscriber *" });
  const post = page.getByRole("button", {
    name: "Post payment & view receipt",
  });
  await search.fill("Amara");
  await expect(page.getByRole("option").first()).toContainText("Amara");
  await expect(page.getByRole("option").first()).toContainText("BCIS-");
  await expect(page.getByRole("option").first()).toContainText("Outstanding");
  await page.screenshot({
    path: "tests/screenshots/payment-subscriber-dropdown.png",
    fullPage: true,
  });
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue(/Amara.*BCIS-/);
  await page.getByLabel("Amount (PHP) *", { exact: true }).fill("500");
  await expect(post).toBeEnabled();
  await search.fill("Ben");
  await expect(post).toBeDisabled();
  await expect(page.getByRole("option").first()).toContainText("Ben");
  await page.getByRole("option").first().click();
  await expect(search).toHaveValue(/Ben.*BCIS-/);
  await expect(post).toBeEnabled();
  await search.fill("no-matching-subscriber-xyz");
  await expect(
    page.getByText("No subscribers found. Try another name or account number."),
  ).toBeVisible();
  await expect(post).toBeDisabled();
  await search.fill("BCIS-00001");
  await expect(page.getByRole("option").first()).toContainText("BCIS-00001");
  await search.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  // Simulate out-of-order search results; an older response must not replace a newer query.
  await page.route("**/api/subscribers?search=*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("search");
    const response = await route.fetch();
    if (query === "Amara")
      await new Promise((resolve) => setTimeout(resolve, 650));
    await route.fulfill({ response });
  });
  await search.fill("Amara");
  await page.waitForTimeout(250);
  await search.fill("Ben");
  await expect(page.getByRole("option").first()).toContainText("Ben");
  await page.waitForTimeout(800);
  await expect(page.getByRole("option").first()).toContainText("Ben");
  // A balance response from a cleared selection must not re-enable payment posting.
  await page.route(/\/api\/subscribers\/\d+$/, async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ response });
  });
  await page.getByRole("option").first().click();
  await search.fill("Amara");
  await page.waitForTimeout(700);
  await expect(post).toBeDisabled();
  if (errors.length) throw new Error(errors.join("\n"));
  await writeFile(
    "tests/payment-search-evidence.json",
    JSON.stringify(
      {
        status: "PASS",
        time: new Date().toISOString(),
        checks: [
          "partial name matches with account/address/balance",
          "keyboard selection",
          "mouse selection",
          "account-number search",
          "no results and Escape",
          "stale search response ignored",
          "editing selection disables posting",
          "stale balance response cannot re-enable posting",
        ],
        paymentsPosted: 0,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "PASS: payment subscriber autocomplete, keyboard/mouse selection and stale-response safeguards; no payments posted.",
  );
} finally {
  await browser.close();
}

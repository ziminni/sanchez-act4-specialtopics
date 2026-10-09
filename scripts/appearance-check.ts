import "dotenv/config";
import { chromium, expect } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
let token = "",
  original: any;
try {
  await page.goto("http://127.0.0.1:5173");
  await page.getByLabel("Username", { exact: true }).fill("admin");
  await page
    .getByLabel("Password", { exact: true })
    .fill(process.env.SEED_PASSWORD!);
  const login = page.waitForResponse((r) => r.url().endsWith("/api/login"));
  await page.getByRole("button", { name: "Sign in to workspace" }).click();
  token = (await (await login).json()).token;
  original = await (
    await page.request.get("http://127.0.0.1:5173/api/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json();
  await page
    .locator("nav")
    .getByRole("button", { name: "System Settings", exact: true })
    .click();
  await page.getByRole("button", { name: "Purple theme", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Button preview", exact: true }),
  ).toHaveCSS("background-color", "rgb(124, 58, 237)");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save changes", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("html")).toHaveCSS("--theme", "#7c3aed");
  const base64 = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 100;
    const x = c.getContext("2d")!;
    x.fillStyle = "#7c3aed";
    x.fillRect(0, 0, 100, 100);
    x.fillStyle = "white";
    x.font = "bold 40px sans-serif";
    x.fillText("AD", 20, 65);
    return c.toDataURL("image/png").split(",")[1];
  });
  await page
    .getByLabel("Choose profile picture")
    .setInputFiles({
      name: "test-avatar.png",
      mimeType: "image/png",
      buffer: Buffer.from(base64, "base64"),
    });
  await expect(
    page.getByRole("button", { name: "Save picture", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Save picture", exact: true }).click();
  await expect(page.getByAltText("Your profile", { exact: true })).toHaveCount(
    2,
  );
  await page.screenshot({
    path: "tests/screenshots/settings-appearance.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Remove picture", exact: true })
    .click();
  await page.getByRole("button", { name: "Save picture", exact: true }).click();
  await expect(page.getByAltText("Your profile", { exact: true })).toHaveCount(
    0,
  );
  console.log(
    "PASS: theme preview/save/global application, image upload/resizing/save and removal. Original settings restored afterward.",
  );
} finally {
  if (token && original) {
    const headers = { Authorization: `Bearer ${token}` };
    await page.request.post("http://127.0.0.1:5173/api/me/profile-picture", {
      headers,
      data: { image: original.profile_image || null },
    });
    await page.request.post("http://127.0.0.1:5173/api/system/settings", {
      headers,
      data: {
        displayName: original.system.displayName,
        supportContact: original.system.supportContact,
        themeColor: original.system.themeColor || "#2563eb",
      },
    });
  }
  await browser.close();
}

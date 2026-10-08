import "dotenv/config";
import { _electron as electron, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
const env: Record<string, string> = Object.fromEntries(
  Object.entries({ ...process.env, NODE_ENV: "production" }).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  ),
);
delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ args: ["."], env });
const page = await app.firstWindow();
const errors: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.getByLabel("Username", { exact: true }).fill("owner");
await page
  .getByLabel("Password", { exact: true })
  .fill(process.env.SEED_PASSWORD!);
await page.getByRole("button", { name: "Sign in to workspace" }).click();
await page.getByRole("heading", { name: "Overview", exact: true }).waitFor();
await page.getByText("Recent payments", { exact: true }).waitFor();
const security = await app.evaluate(({ BrowserWindow }) => {
  const w = BrowserWindow.getAllWindows()[0];
  const p = (w.webContents as any).getLastWebPreferences();
  return {
    nodeIntegration: p.nodeIntegration,
    contextIsolation: p.contextIsolation,
    sandbox: p.sandbox,
  };
});
if (security.nodeIntegration || !security.contextIsolation || !security.sandbox)
  throw new Error("Insecure Electron preferences");
const nodeExposed = await page.evaluate(() => typeof (window as any).require);
if (nodeExposed !== "undefined") throw new Error("Node exposed to renderer");
await page.screenshot({
  path: "tests/screenshots/electron-dashboard.png",
  fullPage: true,
});
await page
  .locator("nav")
  .getByRole("button", { name: "GCash Verification", exact: true })
  .click();
await page.locator(".proof-row").first().waitFor();
const verified = page
  .locator(".proof-row")
  .filter({ hasText: "VERIFIED" })
  .first();
await verified.click();
await page.locator(".proof-preview img").waitFor();
await page.screenshot({
  path: "tests/screenshots/electron-gcash-proof.png",
  fullPage: true,
});
await page
  .locator("nav")
  .getByRole("button", { name: "Reports", exact: true })
  .click();
await page
  .getByRole("heading", { name: "Collection summary", exact: true })
  .waitFor();
await app.evaluate(({ dialog }) => {
  dialog.showSaveDialog = async () => ({
    canceled: false,
    filePath: process.cwd() + "/tests/electron-report-download.pdf",
  });
});
await page
  .locator(".report-card")
  .first()
  .getByRole("button", { name: "PDF", exact: true })
  .click();
await page.getByText("Report saved.", { exact: true }).waitFor();
if (errors.length) throw new Error(errors.join("\n"));
await writeFile(
  "tests/desktop-evidence.json",
  JSON.stringify(
    {
      status: "PASS",
      platform: process.platform,
      checks: [
        "packaged renderer login through IPC",
        "dashboard",
        "sandbox/contextIsolation",
        "no renderer Node API",
        "binary proof preview through IPC",
        "PDF report download through IPC",
      ],
      security,
      time: new Date().toISOString(),
    },
    null,
    2,
  ),
);
await app.close();
console.log(
  "Electron desktop smoke PASS: isolated login, dashboard, proof preview and report download.",
);

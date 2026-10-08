import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { ApiRequest } from "../shared/bridge";
const base = process.env.BCIS_API_URL || "http://127.0.0.1:3001";
ipcMain.handle("bcis:request", async (event, input: ApiRequest) => {
  if (
    event.senderFrame?.url !==
      pathToFileURL(path.join(__dirname, "../../dist/index.html")).href &&
    !(
      process.env.NODE_ENV === "development" &&
      event.senderFrame?.url === "http://127.0.0.1:5173/"
    )
  )
    throw new Error("Untrusted caller");
  if (
    !/^\/api\/[a-zA-Z0-9/?=&_.%-]+$/.test(input.path) ||
    !["GET", "POST"].includes(input.method)
  )
    throw new Error("Unsupported request");
  let body: BodyInit | undefined =
    input.body === undefined ? undefined : JSON.stringify(input.body);
  const headers: Record<string, string> = {
    ...(input.token ? { Authorization: `Bearer ${input.token}` } : {}),
  };
  if (input.upload) {
    if (
      !/^\/api\/proofs\/\d+\/upload$/.test(input.path) ||
      input.upload.bytes.length > 5 * 1024 * 1024
    )
      throw new Error("Invalid upload");
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.upload.bytes)], {
        type: input.upload.type,
      }),
      input.upload.name,
    );
    body = form;
  } else headers["Content-Type"] = "application/json";
  const response = await fetch(base + input.path, {
    method: input.method,
    headers,
    body,
    signal: AbortSignal.timeout(120000),
  });
  return {
    status: response.status,
    body:
      input.binary && response.ok
        ? Buffer.from(await response.arrayBuffer()).toString("base64")
        : await response.json(),
    mime: response.headers.get("content-type"),
  };
});
ipcMain.handle(
  "bcis:save-report",
  async (event, input: { path: string; token: string }) => {
    const trusted = pathToFileURL(
      path.join(__dirname, "../../dist/index.html"),
    ).href;
    if (
      event.senderFrame?.url !== trusted &&
      !(
        process.env.NODE_ENV === "development" &&
        event.senderFrame?.url === "http://127.0.0.1:5173/"
      )
    )
      throw new Error("Untrusted caller");
    if (!/^\/api\/reports\/[a-z]+\?[a-zA-Z0-9=&%-]+$/.test(input.path))
      throw new Error("Invalid report path");
    const url = new URL(input.path, base);
    const format = url.searchParams.get("format");
    if (!["pdf", "xlsx"].includes(format || ""))
      throw new Error("Unsupported format");
    const response = await fetch(base + input.path, {
      headers: { Authorization: `Bearer ${input.token}` },
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw new Error((await response.json()).error || "Report failed");
    const bytes = Buffer.from(await response.arrayBuffer());
    const result = await dialog.showSaveDialog({
      defaultPath: path.join(
        app.getPath("downloads"),
        `bcis-${url.pathname.split("/").at(-1)}.${format}`,
      ),
      filters: [{ name: format!.toUpperCase(), extensions: [format!] }],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    await writeFile(result.filePath, bytes);
    return { saved: true };
  },
);
app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#F6F8FB",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  if (process.env.NODE_ENV === "development")
    win.loadURL("http://127.0.0.1:5173");
  else win.loadFile(path.join(__dirname, "../../dist/index.html"));
});
app.on("window-all-closed", () => app.quit());

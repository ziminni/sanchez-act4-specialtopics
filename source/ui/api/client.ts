import type { DesktopBridge } from "../../shared/bridge";
declare global {
  interface Window {
    bcis?: DesktopBridge;
  }
}
let sessionToken = "";
export const setSessionToken = (token: string) => {
  sessionToken = token;
};
export const currentToken = () => sessionToken;
export async function api(url: string, body?: unknown) {
  const method = body === undefined ? "GET" : "POST";
  let status: number, data: any;
  if (window.bcis) {
    const r = await window.bcis.request({
      path: "/api" + url,
      method,
      token: sessionToken,
      body,
    });
    status = r.status;
    data = r.body;
  } else {
    const r = await fetch("/api" + url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${sessionToken}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = r.status;
    data = await r.json();
  }
  if (status >= 400) throw new Error(data.error || "Request failed");
  return data;
}
export async function binaryApi(url: string): Promise<Blob> {
  if (window.bcis) {
    const r = await window.bcis.request({
      path: "/api" + url,
      method: "GET",
      token: sessionToken,
      binary: true,
    });
    if (r.status >= 400) throw new Error(r.body.error);
    return new Blob([Uint8Array.from(atob(r.body), (c) => c.charCodeAt(0))], {
      type: r.mime,
    });
  }
  const r = await fetch("/api" + url, {
    headers: { Authorization: `Bearer ${sessionToken}` },
  });
  if (!r.ok) throw new Error((await r.json()).error);
  return r.blob();
}
export async function uploadProof(id: number, file: File) {
  if (window.bcis) {
    const r = await window.bcis.request({
      path: `/api/proofs/${id}/upload`,
      method: "POST",
      token: sessionToken,
      upload: {
        bytes: Array.from(new Uint8Array(await file.arrayBuffer())),
        name: file.name,
        type: file.type,
      },
    });
    if (r.status >= 400) throw new Error(r.body.error);
    return;
  }
  const body = new FormData();
  body.append("file", file);
  const r = await fetch(`/api/proofs/${id}/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
    body,
  });
  if (!r.ok) throw new Error((await r.json()).error);
}

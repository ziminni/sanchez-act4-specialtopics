import React, { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";
const maxDataUrl = 460000;
export function SystemLogo({
  logo,
  request,
  saved,
  onDraft,
}: {
  logo: string | null;
  request: (url: string, body?: unknown) => Promise<any>;
  saved: (logo: string | null, logoVersion: string | null) => void;
  onDraft: (logo: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(logo),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(logo), [logo]);
  useEffect(() => onDraft(draft), [draft]);
  const dirty = draft !== logo;
  const select = async (file?: File) => {
    if (!file) return;
    setError("");
    setNotice("");
    if (
      !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setError("Choose a PNG, JPEG or WebP image up to 5 MB.");
      return;
    }
    setBusy(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 256 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      let result = canvas.toDataURL("image/png");
      if (result.length > maxDataUrl) {
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        result = canvas.toDataURL("image/jpeg", 0.9);
      }
      setDraft(result);
    } catch {
      setError("This image could not be read. Choose another file.");
    } finally {
      URL.revokeObjectURL(url);
      setBusy(false);
    }
  };
  return (
    <section className="panel settings-section profile-picture-settings">
      <div className="settings-section-heading">
        <ImageIcon size={21} />
        <div>
          <h3>System logo</h3>
          <p>
            Shown on the sign-in screen, sidebar, receipts and PDF reports for
            all users.
          </p>
        </div>
      </div>
      <div className="profile-picture-controls">
        <div className="system-logo-preview">
          {draft ? (
            <img src={draft} alt="System logo preview" />
          ) : (
            <span>No logo</span>
          )}
        </div>
        <div>
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose system logo"
            disabled={busy}
            onChange={(e) => {
              select(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="admin-note">
            PNG, JPEG or WebP · up to 5 MB. Resized to fit 256 × 256; PNG
            transparency is kept.
          </p>
          <div className="actions">
            <button
              type="button"
              disabled={busy || !draft}
              onClick={() => {
                setDraft(null);
                setNotice("");
              }}
            >
              Remove logo
            </button>
            <button
              type="button"
              disabled={busy || !dirty}
              onClick={() => {
                setDraft(logo);
                setError("");
              }}
            >
              Discard logo change
            </button>
            <button
              type="button"
              className="primary"
              disabled={busy || !dirty}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await request("/system/logo", { image: draft });
                  saved(r.logo, r.logoVersion);
                  setNotice(
                    r.logo
                      ? "System logo saved. Other workspaces update within 30 seconds."
                      : "System logo removed. The default icon is shown again.",
                  );
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Processing…" : "Save logo"}
            </button>
          </div>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
    </section>
  );
}

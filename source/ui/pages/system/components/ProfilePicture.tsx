import { Camera } from "lucide-react";
import { useRef, useState } from "react";

export function ProfilePicture({
  user,
  request,
  saved,
}: {
  user: any;
  request: (url: string, body?: unknown) => Promise<any>;
  saved: (image: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(user.profile_image || null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const ref = useRef<HTMLInputElement>(null);
  const dirty = draft !== (user.profile_image || null);
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
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 256, 256);
      const size = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      setDraft(canvas.toDataURL("image/jpeg", 0.85));
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
        <Camera size={21} />
        <div>
          <h3>Your profile picture</h3>
          <p>Personal to your account. Shown in the header and sidebar.</p>
        </div>
      </div>
      <div className="profile-picture-controls">
        <div className="profile-picture-preview">
          {draft ? (
            <img src={draft} alt="Profile picture preview" />
          ) : (
            user.name.slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <input
            ref={ref}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            aria-label="Choose profile picture"
            disabled={busy}
            onChange={(e) => {
              select(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <p className="admin-note">
            PNG, JPEG or WebP · up to 5 MB. Saved as a centered square.
          </p>
          <div className="actions">
            <button
              disabled={busy || !draft}
              onClick={() => {
                setDraft(null);
                setNotice("");
              }}
            >
              Remove picture
            </button>
            <button
              disabled={busy || !dirty}
              onClick={() => {
                setDraft(user.profile_image || null);
                setError("");
              }}
            >
              Discard picture change
            </button>
            <button
              className="primary"
              disabled={busy || !dirty}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const r = await request("/me/profile-picture", {
                    image: draft,
                  });
                  saved(r.profile_image);
                  setNotice("Profile picture saved.");
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Processing…" : "Save picture"}
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

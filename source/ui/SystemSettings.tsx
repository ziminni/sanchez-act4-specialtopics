import React, { useEffect, useState } from "react";
import {
  Settings,
  Building2,
  LifeBuoy,
  ShieldCheck,
  Clock,
  CheckCircle2,
  Save,
} from "lucide-react";
type Values = { displayName: string; supportContact: string };
export function SystemSettings({
  data,
  request,
  saved,
}: {
  data: Values & { updated?: { created_at: string; actor: string } | null };
  request: (url: string, body?: unknown) => Promise<any>;
  saved: (v: Values) => Promise<void>;
}) {
  const [values, setValues] = useState<Values>({
    displayName: data.displayName,
    supportContact: data.supportContact,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setValues({
      displayName: data.displayName,
      supportContact: data.supportContact,
    });
  }, [data.displayName, data.supportContact]);
  const dirty =
    values.displayName !== data.displayName ||
    values.supportContact !== data.supportContact;
  const valid =
    values.displayName.trim().length > 0 &&
    values.displayName.length <= 200 &&
    values.supportContact.length <= 200;
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", before);
    return () => window.removeEventListener("beforeunload", before);
  }, [dirty]);
  return (
    <div className="settings-workspace">
      <section className="audit-intro">
        <div className="audit-icon">
          <Settings size={26} />
        </div>
        <div>
          <h2>System preferences</h2>
          <p>Manage workspace identity and staff support information.</p>
        </div>
        <span className="audit-readonly">Administrator controls</span>
      </section>
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
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid || !dirty) return;
          setBusy(true);
          setError("");
          setNotice("");
          try {
            const result = await request("/system/settings", {
              displayName: values.displayName.trim(),
              supportContact: values.supportContact.trim(),
            });
            await saved(result);
            setValues(result);
            setNotice(
              "System settings saved. Workspace identity and support information are updated.",
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="settings-grid">
          <div className="settings-fields">
            <section className="panel settings-section">
              <div className="settings-section-heading">
                <Building2 size={21} />
                <div>
                  <h3>Workspace identity</h3>
                  <p>Recognize your system at a glance.</p>
                </div>
              </div>
              <label htmlFor="system-display-name">
                System display name <span>*</span>
              </label>
              <input
                id="system-display-name"
                required
                maxLength={200}
                disabled={busy}
                value={values.displayName}
                onChange={(e) => {
                  setValues({ ...values, displayName: e.target.value });
                  setNotice("");
                }}
                aria-describedby="system-name-help"
              />
              <div className="settings-field-help">
                <span id="system-name-help">
                  Shown in the signed-in workspace sidebar.
                </span>
                <span>{values.displayName.length}/200</span>
              </div>
              {!values.displayName.trim() && (
                <p className="settings-validation">Enter a display name.</p>
              )}
            </section>
            <section className="panel settings-section">
              <div className="settings-section-heading">
                <LifeBuoy size={21} />
                <div>
                  <h3>Staff support</h3>
                  <p>Tell your team how to get help.</p>
                </div>
              </div>
              <label htmlFor="system-support">
                Support contact <span className="optional">Optional</span>
              </label>
              <input
                id="system-support"
                maxLength={200}
                disabled={busy}
                placeholder="Email, phone number or help desk instructions"
                value={values.supportContact}
                onChange={(e) => {
                  setValues({ ...values, supportContact: e.target.value });
                  setNotice("");
                }}
                aria-describedby="support-help"
              />
              <div className="settings-field-help">
                <span id="support-help">
                  Shown in the sidebar to signed-in users. Leave blank to hide
                  it.
                </span>
                <span>{values.supportContact.length}/200</span>
              </div>
            </section>
            <section className="panel settings-section">
              <div className="settings-section-heading">
                <Clock size={21} />
                <div>
                  <h3>Regional defaults</h3>
                  <p>Fixed system behavior</p>
                </div>
              </div>
              <dl className="settings-facts">
                <dt>Time zone</dt>
                <dd>Asia/Manila · UTC+08:00</dd>
                <dt>Display currency</dt>
                <dd>Philippine peso · PHP</dd>
                <dt>Audit timestamps</dt>
                <dd>Philippine time</dd>
              </dl>
              <p className="admin-note">
                These defaults are fixed to keep reports and audit records
                consistent.
              </p>
            </section>
          </div>
          <section className="panel settings-preview">
            <h3>Workspace preview</h3>
            <p className="admin-note">
              Preview updates as you type. Save to apply changes.
            </p>
            <div className="settings-preview-card">
              <div className="settings-preview-mark">
                <Settings size={24} />
              </div>
              <strong>{values.displayName.trim() || "Your system name"}</strong>
              <small>System administration</small>
              {values.supportContact.trim() && (
                <div>
                  <span>Support</span>
                  <p>{values.supportContact.trim()}</p>
                </div>
              )}
            </div>
            <div className="settings-assurance">
              <ShieldCheck size={20} />
              <div>
                <strong>Audited changes</strong>
                <p>Saved settings are recorded in Security Audit.</p>
              </div>
            </div>
            <div className="settings-assurance">
              <CheckCircle2 size={20} />
              <div>
                <strong>Applies to staff workspaces</strong>
                <p>
                  Your sidebar updates immediately. Other users see changes the
                  next time they sign in.
                </p>
              </div>
            </div>
          </section>
        </div>
        <div className="panel settings-savebar">
          <div>
            <strong>
              {dirty ? "You have unsaved changes" : "Settings are up to date"}
            </strong>
            <small>
              {data.updated
                ? `Last saved by ${data.updated.actor || "Unknown user"} · ${new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(data.updated.created_at))} PHT`
                : "No settings changes recorded yet."}
            </small>
          </div>
          <button
            type="button"
            disabled={busy || !dirty}
            onClick={() => {
              setValues({
                displayName: data.displayName,
                supportContact: data.supportContact,
              });
              setError("");
              setNotice("");
            }}
          >
            Discard changes
          </button>
          <button className="primary" disabled={busy || !dirty || !valid}>
            <Save size={16} />
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

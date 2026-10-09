import {
  Building2,
  CheckCircle2,
  Clock,
  Landmark,
  LifeBuoy,
  Save,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../../api/client";
import { defaultTheme, themeStyle } from "../../lib/theme";
import { useApp } from "../../app/AppContext";
import { ProfilePicture } from "./components/ProfilePicture";
import { SystemLogo } from "./components/SystemLogo";

type Values = {
  displayName: string;
  supportContact: string;
  themeColor?: string;
  businessName: string;
  address: string;
  contactNumber: string;
  email: string;
  tin: string;
};
const fromData = (data: Partial<Values>): Values => ({
  displayName: data.displayName ?? "",
  supportContact: data.supportContact ?? "",
  themeColor: data.themeColor || defaultTheme,
  businessName: data.businessName ?? "",
  address: data.address ?? "",
  contactNumber: data.contactNumber ?? "",
  email: data.email ?? "",
  tin: data.tin ?? "",
});
const businessFields: [keyof Values, string, string, number, string][] = [
  [
    "businessName",
    "Registered business name",
    "Printed on receipts, report headers and the sign-in screen.",
    200,
    "",
  ],
  [
    "address",
    "Business address",
    "Street, barangay, city and province.",
    300,
    "",
  ],
  ["contactNumber", "Contact number", "Landline or mobile number.", 100, ""],
  ["email", "Business email", "For subscriber and billing inquiries.", 200, ""],
  [
    "tin",
    "Tax Identification Number (TIN)",
    "Format 000-000-000-000.",
    17,
    "000-000-000-000",
  ],
];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const tinPattern = /^(\d{3}-\d{3}-\d{3}(-\d{3,5})?)?$/;
export function SystemSettings({
  data,
  request,
  saved,
  user,
  pictureSaved,
  logo,
  logoSaved,
}: {
  data: Values & { updated?: { created_at: string; actor: string } | null };
  request: (url: string, body?: unknown) => Promise<any>;
  saved: (v: Values) => Promise<void>;
  user: any;
  pictureSaved: (image: string | null) => void;
  logo: string | null;
  logoSaved: (logo: string | null, logoVersion: string | null) => void;
}) {
  const [values, setValues] = useState<Values>(fromData(data));
  const [logoDraft, setLogoDraft] = useState<string | null>(logo);
  const original = fromData(data);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    setValues(fromData(data));
  }, [JSON.stringify(original)]);
  const dirty = (Object.keys(original) as (keyof Values)[]).some(
    (k) => values[k] !== original[k],
  );
  const fieldError: Partial<Record<keyof Values, string>> = {
    businessName: values.businessName.trim()
      ? ""
      : "Enter the registered business name.",
    email:
      values.email.trim() && !emailPattern.test(values.email.trim())
        ? "Enter a valid email address."
        : "",
    tin: tinPattern.test(values.tin.trim())
      ? ""
      : "Use the format 000-000-000 or 000-000-000-000.",
  };
  const valid =
    values.displayName.trim().length > 0 &&
    values.displayName.length <= 200 &&
    values.supportContact.length <= 200 &&
    !Object.values(fieldError).some(Boolean);
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
          <p>
            Manage the system profile, workspace identity and staff support
            information.
          </p>
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
      <SystemLogo
        logo={logo}
        request={request}
        saved={logoSaved}
        onDraft={setLogoDraft}
      />
      <ProfilePicture user={user} request={request} saved={pictureSaved} />
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
              themeColor: values.themeColor,
              businessName: values.businessName.trim(),
              address: values.address.trim(),
              contactNumber: values.contactNumber.trim(),
              email: values.email.trim(),
              tin: values.tin.trim(),
            });
            await saved(result);
            setValues(fromData(result));
            setNotice(
              "System settings saved. The system profile, workspace identity and support information are updated.",
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
                <Settings size={21} />
                <div>
                  <h3>System theme color</h3>
                  <p>Applies to all roles, pages and the sign-in screen.</p>
                </div>
              </div>
              <label htmlFor="theme-color">Accent color</label>
              <div className="theme-color-control">
                <input
                  id="theme-color"
                  type="color"
                  value={values.themeColor || defaultTheme}
                  disabled={busy}
                  onChange={(e) =>
                    setValues({ ...values, themeColor: e.target.value })
                  }
                />
                <code>{values.themeColor || defaultTheme}</code>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    setValues({ ...values, themeColor: defaultTheme })
                  }
                >
                  Default blue
                </button>
              </div>
              <div className="theme-swatches">
                {[
                  ["Blue", "#2563eb"],
                  ["Purple", "#7c3aed"],
                  ["Green", "#15803d"],
                  ["Teal", "#0f766e"],
                  ["Rose", "#be185d"],
                  ["Orange", "#c2410c"],
                ].map(([name, color]) => (
                  <button
                    type="button"
                    key={name}
                    aria-label={`${name} theme`}
                    aria-pressed={values.themeColor === color}
                    disabled={busy}
                    onClick={() => setValues({ ...values, themeColor: color })}
                    style={{ background: color }}
                  />
                ))}
              </div>
              <p className="admin-note">
                Buttons, navigation, focus rings and charts use this color.
                Status colors retain their meaning. Other workspaces update
                within 30 seconds.
              </p>
            </section>

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
                <Landmark size={21} />
                <div>
                  <h3>Business profile</h3>
                  <p>Company details printed on receipts and reports.</p>
                </div>
              </div>
              {businessFields.map(([key, label, help, max, placeholder]) => (
                <div className="settings-field" key={key}>
                  <label htmlFor={`system-${key}`}>
                    {label}{" "}
                    {key === "businessName" ? (
                      <span>*</span>
                    ) : (
                      <span className="optional">Optional</span>
                    )}
                  </label>
                  <input
                    id={`system-${key}`}
                    required={key === "businessName"}
                    type={key === "email" ? "email" : "text"}
                    maxLength={max}
                    placeholder={placeholder}
                    disabled={busy}
                    value={values[key]}
                    aria-invalid={Boolean(fieldError[key])}
                    aria-describedby={`system-${key}-help`}
                    onChange={(e) => {
                      setValues({ ...values, [key]: e.target.value });
                      setNotice("");
                    }}
                  />
                  <div className="settings-field-help">
                    <span id={`system-${key}-help`}>{help}</span>
                    <span>
                      {String(values[key] ?? "").length}/{max}
                    </span>
                  </div>
                  {fieldError[key] && (
                    <p className="settings-validation">{fieldError[key]}</p>
                  )}
                </div>
              ))}
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
            <div
              className="settings-preview-card"
              style={themeStyle(values.themeColor || defaultTheme)}
            >
              <div className="settings-preview-mark">
                {logoDraft ? (
                  <img src={logoDraft} alt="System logo" />
                ) : (
                  <Settings size={24} />
                )}
              </div>
              <strong>{values.displayName.trim() || "Your system name"}</strong>
              <small>
                {values.businessName.trim() || "Registered business name"}
              </small>
              {[
                values.address.trim(),
                values.contactNumber.trim(),
                values.email.trim(),
                values.tin.trim() && `TIN ${values.tin.trim()}`,
              ].some(Boolean) && (
                <p className="settings-preview-business">
                  {[
                    values.address.trim(),
                    values.contactNumber.trim(),
                    values.email.trim(),
                    values.tin.trim() && `TIN ${values.tin.trim()}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <button type="button" className="primary theme-preview-button">
                Button preview
              </button>
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
              setValues(fromData(data));
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

export function SystemSettingsPage() {
  const {
    user,
    setUser,
    data,
    setThemeColor,
    branding,
    setBranding,
    logoVersionRef,
    reload,
  } = useApp();
  return (
    <>
      <SystemSettings
        data={data}
        user={user}
        pictureSaved={(image) => setUser({ ...user, profile_image: image })}
        logo={branding.logo}
        logoSaved={(logo, logoVersion) => {
          logoVersionRef.current = logoVersion;
          setBranding((b) => ({ ...b, logo, logoVersion }));
        }}
        request={api}
        saved={async (value) => {
          setUser({ ...user, system: value });
          setBranding((b) => ({
            ...b,
            businessName: value.businessName || b.businessName,
          }));
          setThemeColor(value.themeColor || defaultTheme);
          await reload();
        }}
      />
    </>
  );
}

import { ArrowUpRight, ShieldCheck, Wifi } from "lucide-react";
import { api, setSessionToken } from "../../api/client";
import { Field } from "../../components/Field";
import { useApp } from "../../app/AppContext";

export function LoginPage() {
  const { setUser, setPage, error, busy, branding, submit } = useApp();
  return (
    <>
      <div className="login">
        <div className="login-brand">
          <div className="brand-mark">
            {branding.logo ? (
              <img src={branding.logo} alt="System logo" />
            ) : (
              <Wifi size={26} />
            )}
          </div>
          <h1>
            BCIS<span>Billing & Collections</span>
          </h1>
          <p>
            A clear view of every account.
            <br />
            Confidence in every collection.
          </p>
          <div className="login-foot">
            {branding.businessName.toUpperCase()}
          </div>
        </div>
        <div className="login-form">
          <div className="eyebrow">YOUR OPERATIONS, CONNECTED</div>
          <h2>Welcome back</h2>
          <p>Sign in to your BCIS workspace.</p>
          <form
            onSubmit={(e) =>
              submit(e, async (b) => {
                const r = await api("/login", b);
                setSessionToken(r.token);
                const me = await api("/me");
                setUser(me);
                setPage("Dashboard");
              })
            }
          >
            <Field label="Username">
              <input
                name="username"
                required
                autoComplete="username"
                autoFocus
              />
            </Field>
            <Field label="Password">
              <input
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            {error && <div className="error">{error}</div>}
            <button className="primary full" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
              <ArrowUpRight size={17} />
            </button>
          </form>
          <p className="secure">
            <ShieldCheck size={15} /> Secure, role-based access · BCIS LAN
          </p>
        </div>
      </div>
    </>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, ErrorAlert, Field, PasswordInput } from "../../components/ui";
import { homePathFor, useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { AuthLayout } from "../../layouts/AuthLayout";
import { ApiError, api } from "../../services/api";

export default function LoginPage() {
  const { login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as { from?: string; message?: string };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = "Enter a valid email address.";
    if (!password) next.password = "Password is required.";
    setErrors(next);
    setFormError(null);
    setNeedsVerification(false);
    if (Object.keys(next).length) return;

    setLoading(true);
    try {
      const user = await login(email.trim(), password, rememberMe);
      toast(`Welcome back, ${user.fullName.split(" ")[0]}!`, "success");
      const target = user.role === "STUDENT" && user.onboardingCompleted && state.from?.startsWith("/") && !state.from.startsWith("/admin") ? state.from : homePathFor(user);
      navigate(target, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors());
        setNeedsVerification(err.code === "EMAIL_NOT_VERIFIED");
      }
      setFormError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    await api.post("/auth/resend-verification", { email: email.trim() }).catch(() => undefined);
    toast("If your account needs verification, a new link has been sent.", "info");
  };

  return (
    <AuthLayout>
      <h2>Welcome back</h2>
      <p className="sub">Log in to continue to your CampusHub dashboard.</p>
      <form className="form" onSubmit={submit} noValidate>
        {state.message && <div className="alert alert-success">{state.message}</div>}
        <ErrorAlert message={formError} />
        {needsVerification && (
          <button type="button" className="btn btn-secondary btn-sm" onClick={resend}>Resend verification email</button>
        )}
        <Field label="Email address" htmlFor="email" error={errors.email}>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email)} placeholder="you@college.edu" />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password}>
          <PasswordInput id="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={Boolean(errors.password)} />
        </Field>
        <div className="row-between">
          <label className="checkbox">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            Remember me for 30 days
          </label>
          <Link className="link small" to="/forgot-password">Forgot password?</Link>
        </div>
        <Button type="submit" className="btn-primary btn-block" loading={loading}>Log in</Button>
      </form>
      <p className="switch">
        New to CampusHub? <Link className="link" to="/register">Create a student account</Link>
      </p>
      {import.meta.env.DEV && (
        <div className="demo-box" style={{ marginTop: 24 }}>
          <strong className="gold">Demo accounts (development seed only)</strong>
          <div>Student: <code>ajith@campushub.dev</code> / <code>Student@123</code></div>
          <div>Admin: <code>admin@campushub.dev</code> / <code>Admin@12345</code></div>
        </div>
      )}
    </AuthLayout>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, ErrorAlert, Field, PasswordInput } from "../../components/ui";
import { AuthLayout } from "../../layouts/AuthLayout";
import { ApiError, api } from "../../services/api";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(token ? null : "This reset link is missing its token. Request a new one.");
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) next.password = "Use 8+ characters with uppercase, lowercase and a number.";
    if (password !== confirmPassword) next.confirmPassword = "Passwords do not match.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/auth/reset-password", { token, password, confirmPassword });
      navigate("/login", { replace: true, state: { message: res.message } });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Choose a new password</h2>
      <p className="sub">For your security, this will log you out of every device.</p>
      <form className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={error} />
        <Field label="New password" htmlFor="password" error={errors.password}>
          <PasswordInput id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={errors.confirmPassword}>
          <PasswordInput id="confirm" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
        </Field>
        <Button type="submit" className="btn-primary btn-block" loading={loading} disabled={!token}>Reset password</Button>
        <p className="switch"><Link className="link" to="/forgot-password">Request a new link</Link></p>
      </form>
    </AuthLayout>
  );
}

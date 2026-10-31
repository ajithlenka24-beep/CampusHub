import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, ErrorAlert, Field } from "../../components/ui";
import { AuthLayout } from "../../layouts/AuthLayout";
import { api, errorMessage } from "../../services/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await api.post<{ message: string }>("/auth/forgot-password", { email: email.trim() });
      setSent(res.message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Forgot your password?</h2>
      <p className="sub">Enter your account email and we'll send you a link to reset it.</p>
      {sent ? (
        <div className="stack">
          <div className="alert alert-success">{sent}</div>
          {import.meta.env.DEV && <p className="faint small">Development tip: without SMTP configured, the reset link is printed in the backend terminal.</p>}
          <Link className="btn btn-secondary" to="/login">Back to login</Link>
        </div>
      ) : (
        <form className="form" onSubmit={submit} noValidate>
          <ErrorAlert message={error} />
          <Field label="Email address" htmlFor="email">
            <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Button type="submit" className="btn-primary btn-block" loading={loading}>Send reset link</Button>
          <p className="switch"><Link className="link" to="/login">Back to login</Link></p>
        </form>
      )}
    </AuthLayout>
  );
}

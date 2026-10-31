import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { Button, ErrorAlert, Field, PasswordInput } from "../../components/ui";
import { AuthLayout } from "../../layouts/AuthLayout";
import { ApiError, api } from "../../services/api";

const RULES = [
  { test: (p: string) => p.length >= 8, label: "At least 8 characters" },
  { test: (p: string) => /[A-Z]/.test(p), label: "An uppercase letter" },
  { test: (p: string) => /[a-z]/.test(p), label: "A lowercase letter" },
  { test: (p: string) => /[0-9]/.test(p), label: "A number" },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: "", email: "", password: "", confirmPassword: "", college: "", course: "", semester: "", acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const set = (key: keyof typeof form) => (value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = "Enter your full name.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = "Enter a valid college email.";
    if (!RULES.every((r) => r.test(form.password))) e.password = "Your password doesn't meet all the requirements.";
    if (form.password !== form.confirmPassword) e.confirmPassword = "Passwords do not match.";
    if (form.college.trim().length < 2) e.college = "Enter your college name.";
    if (form.course.trim().length < 2) e.course = "Enter your course.";
    if (!form.semester) e.semester = "Choose your semester.";
    if (!form.acceptTerms) e.acceptTerms = "You must accept the terms and conditions.";
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    setFormError(null);
    if (Object.keys(e).length) return;
    setLoading(true);
    try {
      const res = await api.post<{ message: string }>("/auth/register", { ...form, semester: Number(form.semester) });
      navigate("/login", { replace: true, state: { message: res.message } });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <h2>Create your account</h2>
      <p className="sub">Join CampusHub to match with opportunities and build your team.</p>
      <form className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={formError} />
        <Field label="Full name" htmlFor="fullName" error={errors.fullName} required>
          <input id="fullName" className="input" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} aria-invalid={Boolean(errors.fullName)} />
        </Field>
        <Field label="College email" htmlFor="email" error={errors.email} required>
          <input id="email" className="input" type="email" autoComplete="email" placeholder="you@college.edu" value={form.email} onChange={(e) => set("email")(e.target.value)} aria-invalid={Boolean(errors.email)} />
        </Field>
        <div className="form-grid">
          <Field label="Password" htmlFor="password" error={errors.password} required>
            <PasswordInput id="password" autoComplete="new-password" value={form.password} onChange={(e) => set("password")(e.target.value)} aria-invalid={Boolean(errors.password)} />
          </Field>
          <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
            <PasswordInput id="confirmPassword" autoComplete="new-password" value={form.confirmPassword} onChange={(e) => set("confirmPassword")(e.target.value)} aria-invalid={Boolean(errors.confirmPassword)} />
          </Field>
        </div>
        <ul className="password-rules" aria-label="Password requirements">
          {RULES.map((r) => (
            <li key={r.label} className={r.test(form.password) ? "ok" : ""}>{r.test(form.password) ? "✓" : "•"} {r.label}</li>
          ))}
        </ul>
        <Field label="College name" htmlFor="college" error={errors.college} required>
          <input id="college" className="input" value={form.college} onChange={(e) => set("college")(e.target.value)} aria-invalid={Boolean(errors.college)} />
        </Field>
        <div className="form-grid">
          <Field label="Course" htmlFor="course" error={errors.course} required>
            <input id="course" className="input" placeholder="e.g. B.Tech CSE" value={form.course} onChange={(e) => set("course")(e.target.value)} aria-invalid={Boolean(errors.course)} />
          </Field>
          <Field label="Semester" htmlFor="semester" error={errors.semester} required>
            <select id="semester" className="select" value={form.semester} onChange={(e) => set("semester")(e.target.value)} aria-invalid={Boolean(errors.semester)}>
              <option value="">Select…</option>
              {Array.from({ length: 10 }, (_, i) => (
                <option key={i + 1} value={i + 1}>Semester {i + 1}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="field">
          <label className="checkbox">
            <input type="checkbox" checked={form.acceptTerms} onChange={(e) => set("acceptTerms")(e.target.checked)} />
            <span>
              I agree to the <button type="button" className="link" onClick={() => setShowTerms(true)}>terms and conditions</button>.
            </span>
          </label>
          {errors.acceptTerms && <span className="field-error">{errors.acceptTerms}</span>}
        </div>
        <Button type="submit" className="btn-primary btn-block" loading={loading}>Create account</Button>
      </form>
      <p className="switch">
        Already have an account? <Link className="link" to="/login">Log in</Link>
      </p>
      <Modal open={showTerms} title="Terms and conditions" onClose={() => setShowTerms(false)} footer={<Button onClick={() => { set("acceptTerms")(true); setShowTerms(false); }}>I agree</Button>}>
        <div className="stack muted small">
          <p>CampusHub is a student project platform. By creating an account you agree to:</p>
          <p>1. Provide accurate information about your skills, projects and achievements.</p>
          <p>2. Use CampusHub only for genuine academic and career purposes, and treat other students respectfully.</p>
          <p>3. Your profile (name, college, course, skills and projects) is visible to other CampusHub students for team building. Your email, applications, notifications and assistant conversations stay private.</p>
          <p>4. Administrators can see your applications to opportunities and update their status.</p>
          <p>5. You can ask an administrator to deactivate your account at any time.</p>
        </div>
      </Modal>
    </AuthLayout>
  );
}

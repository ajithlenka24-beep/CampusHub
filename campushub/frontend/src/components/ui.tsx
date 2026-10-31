import { useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode } from "react";
import type { ApplicationStatus } from "../types";
import { STATUS_LABELS, initials, matchColor } from "../utils/format";
import { Icon } from "./Icon";
import { Modal } from "./Modal";

export function Spinner() {
  return <span className="spinner" role="status" aria-label="Loading" />;
}

export function PageLoading() {
  return (
    <div className="page-loading">
      <Spinner />
    </div>
  );
}

export function Button({ loading, children, className = "btn-primary", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button type="button" className={`btn ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** Label + control + hint/error, with the error linked for screen readers. */
export function Field({ label, error, hint, required, children, full, htmlFor }: { label: string; error?: string; hint?: string; required?: boolean; children: ReactNode; full?: boolean; htmlFor?: string }) {
  return (
    <div className={`field ${full ? "field-full" : ""}`}>
      <label className="label" htmlFor={htmlFor}>
        {label}
        {required && <span className="req" aria-hidden="true">*</span>}
      </label>
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="input-wrap">
      <input {...props} type={show ? "text" : "password"} className="input" />
      <button type="button" className="input-action" aria-label={show ? "Hide password" : "Show password"} onClick={() => setShow((s) => !s)}>
        <Icon name={show ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

export function EmptyState({ icon = "sparkles", title, children }: { icon?: string; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Avatar({ name, url, size = "md" }: { name: string; url?: string | null; size?: "sm" | "md" | "lg" }) {
  const [broken, setBroken] = useState(false);
  if (url && !broken) return <img className={`avatar avatar-${size}`} src={url} alt={`${name}'s profile picture`} onError={() => setBroken(true)} />;
  return (
    <span className={`avatar avatar-${size}`} aria-label={name} role="img">
      {initials(name)}
    </span>
  );
}

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return <span className={`status-badge status-${status}`}>{STATUS_LABELS[status]}</span>;
}

/** The original "Match: 75%" container with a bar, now driven by real data. */
export function MatchBar({ percentage, label = "Match", meta }: { percentage: number; label?: string; meta?: ReactNode }) {
  return (
    <div className="match-score-container" style={{ "--match": percentage, "--match-color": matchColor(percentage) } as CSSProperties}>
      <p className="match-score" aria-label={`Skill match ${percentage}%`}>
        {label}: {percentage}%
      </p>
      {meta && <div className="match-meta">{meta}</div>}
    </div>
  );
}

/** The original circular score display. */
export function ScoreRing({ value, size, label }: { value: number; size?: "sm" | "lg"; label?: string }) {
  return (
    <div className={`score-circle ${size ?? ""}`} style={{ "--score": value } as CSSProperties} role="img" aria-label={`${label ?? "Score"} ${value}%`}>
      <span className="score-value">{value}%</span>
    </div>
  );
}

export function ProgressBar({ value, tone }: { value: number; tone?: "mint" | "amber" }) {
  return (
    <div className={`bar ${tone ?? ""}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function PageHead({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

/** Confirmation dialog (replaces the browser's confirm()). */
export function ConfirmModal({ open, title, message, confirmLabel = "Confirm", danger, loading, onConfirm, onClose }: { open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button className="btn-secondary" onClick={onClose}>Cancel</Button>
          <Button className={danger ? "btn-danger" : "btn-primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  );
}

export function ErrorAlert({ message }: { message?: string | null }) {
  if (!message) return null;
  return <div className="alert alert-error" role="alert">{message}</div>;
}

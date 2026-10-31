import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { Button, ErrorAlert, Field, PageLoading, ScoreRing, StatusBadge } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage } from "../services/api";
import type { Opportunity } from "../types";
import { TYPE_LABELS, WORK_MODE_LABELS, deadlineText, formatDate } from "../utils/format";

export function ApplyModal({ opportunity, onClose, onApplied }: { opportunity: Opportunity; onClose: () => void; onApplied: () => Promise<void> }) {
  const toast = useToast();
  const [coverNote, setCoverNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.post(`/opportunities/${opportunity.id}/apply`, { coverNote });
      toast(`Application submitted for ${opportunity.title}. Track it in My Applications.`, "success");
      await onApplied();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open title={`Apply: ${opportunity.title}`} subtitle={`${opportunity.organization} · ${opportunity.match.percentage}% skill match`} onClose={onClose}
      footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button loading={saving} onClick={submit}>Submit application</Button></>}>
      <div className="form">
        <ErrorAlert message={error} />
        {opportunity.match.missing.length > 0 && (
          <div className="alert alert-info small">You're missing {opportunity.match.missing.map((s) => s.name).join(", ")}. You can still apply. Mention related experience in your note.</div>
        )}
        <Field label="Cover note (optional)" hint="Why are you a good fit? Visible to the organisers.">
          <textarea className="textarea" maxLength={1500} value={coverNote} onChange={(e) => setCoverNote(e.target.value)} />
        </Field>
        <p className="faint small">Your profile, skills and projects are shared with administrators when you apply.</p>
      </div>
    </Modal>
  );
}

export default function OpportunityDetailPage() {
  const { id } = useParams();
  const { data, loading, error, reload } = useApi<{ opportunity: Opportunity; recommendedSkills: string[] }>(`/opportunities/${id}`);
  const [applying, setApplying] = useState(false);

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="stack"><div className="alert alert-error">{error ?? "Not found."}</div><Link className="link" to="/opportunities">← Back to opportunities</Link></div>;
  const o = data.opportunity;

  return (
    <div className="stack-lg">
      <Link className="link small" to="/opportunities">← All opportunities</Link>
      <section className="hero-welcome">
        <div className="row" style={{ marginBottom: 12 }}>
          <span className="pill">{TYPE_LABELS[o.type]}</span>
          <span className="pill pill-muted">{WORK_MODE_LABELS[o.workMode]}</span>
          {o.application && <StatusBadge status={o.application.status} />}
        </div>
        <h1>{o.title}</h1>
        <p className="sub">{o.organization}{o.location ? ` · ${o.location}` : ""}</p>
      </section>

      <div className="dashboard-grid">
        <div className="stack-lg">
          <section className="card">
            <div className="kv">
              <div><span className="k">Deadline</span><span className="v">{formatDate(o.deadline)}</span><span className={`deadline-note ${o.isOpen && o.daysLeft <= 3 ? "urgent" : ""}`}>{deadlineText(o.daysLeft, o.isOpen)}</span></div>
              <div><span className="k">Work mode</span><span className="v">{WORK_MODE_LABELS[o.workMode]}</span></div>
              <div><span className="k">Location</span><span className="v">{o.location || "—"}</span></div>
              <div><span className="k">Posted</span><span className="v">{formatDate(o.createdAt)}</span></div>
            </div>
          </section>
          <section className="card">
            <div className="card-head"><h2>About this opportunity</h2></div>
            <p className="muted" style={{ whiteSpace: "pre-line", lineHeight: 1.75 }}>{o.description}</p>
            {o.eligibility && (
              <>
                <div className="card-title-gold" style={{ margin: "22px 0 8px" }}>Eligibility</div>
                <p className="muted">{o.eligibility}</p>
              </>
            )}
            {o.applicationUrl && <a className="btn btn-secondary btn-sm" style={{ marginTop: 18 }} href={o.applicationUrl} target="_blank" rel="noopener noreferrer"><Icon name="external" /> Organiser's page</a>}
          </section>
        </div>

        <div className="stack-lg">
          <section className="card card-highlight">
            <div className="card-head"><h2>Your skill match</h2></div>
            <div className="row" style={{ gap: 24 }}>
              <ScoreRing value={o.match.percentage} label="Skill match" />
              <div className="stack" style={{ flex: 1, gap: 10 }}>
                <div className="card-title-gold">Matched skills</div>
                <ul className="comparison-list">
                  {o.match.matched.length ? o.match.matched.map((s) => <li key={s.id} className="match-success"><span aria-hidden="true">✓</span> {s.name}</li>) : <li className="faint small">None yet</li>}
                </ul>
                <div className="card-title-gold">Missing skills</div>
                <ul className="comparison-list">
                  {o.match.missing.length ? o.match.missing.map((s) => <li key={s.id} className="match-fail"><span aria-hidden="true">✗</span> {s.name}</li>) : <li className="mint small">You have every required skill</li>}
                </ul>
              </div>
            </div>
            <p className="formula" style={{ marginTop: 18 }}>Match = matched ÷ required × 100 = <strong>{o.match.formula}</strong></p>
          </section>

          {data.recommendedSkills.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Recommended skills to learn</h2></div>
              <ul className="bullet-list">
                {data.recommendedSkills.map((s) => <li key={s}><strong>{s}</strong>: adding it raises your match to {Math.round(((o.match.matched.length + 1) / o.match.requiredCount) * 100)}%</li>)}
              </ul>
              <Link className="link small" to="/profile">Add skills on your profile →</Link>
            </section>
          )}

          <section className="card">
            {o.application ? (
              <div className="stack">
                <div className="row-between"><strong>Application submitted</strong><StatusBadge status={o.application.status} /></div>
                <Link className="btn btn-secondary" to="/applications">Track application</Link>
              </div>
            ) : o.isOpen ? (
              <div className="stack">
                <p className="muted small">Applications close {formatDate(o.deadline)}.</p>
                <Button onClick={() => setApplying(true)}>Apply now</Button>
              </div>
            ) : (
              <div className="alert alert-warning">This opportunity is no longer accepting applications.</div>
            )}
          </section>
        </div>
      </div>
      {applying && <ApplyModal opportunity={o} onClose={() => setApplying(false)} onApplied={async () => { setApplying(false); await reload(); }} />}
    </div>
  );
}

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { TagInput } from "../components/TagInput";
import { Button, EmptyState, ErrorAlert, Field, PageHead, PageLoading, ProgressBar } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { ApiError, api, errorMessage } from "../services/api";
import type { Team } from "../types";
import { timeAgo } from "../utils/format";

interface Invitation { id: string; message: string; createdAt: string; teamId: string; teamName: string; projectTitle: string; inviterName: string }

export function TeamFormModal({ team, onClose, onSaved }: { team?: Team; onClose: () => void; onSaved: (team: Team) => void }) {
  const [form, setForm] = useState({ name: team?.name ?? "", projectTitle: team?.projectTitle ?? "", description: team?.description ?? "", maxSize: String(team?.maxSize ?? 5) });
  const [skills, setSkills] = useState<string[]>(team?.requiredSkills.map((s) => s.name) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const body = { ...form, maxSize: Number(form.maxSize), requiredSkills: skills };
      const res = team ? await api.put<{ team: Team }>(`/teams/${team.id}`, body) : await api.post<{ team: Team }>("/teams", body);
      onSaved(res.team);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Modal open size="lg" title={team ? "Edit team" : "Create a team"} subtitle="CampusHub analyses your members' combined skills and suggests teammates." onClose={onClose}
      footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="team-form" loading={saving}>{team ? "Save changes" : "Create team"}</Button></>}>
      <form id="team-form" className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={error} />
        <div className="form-grid">
          <Field label="Team name" error={errors.name} required><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Team Phoenix" /></Field>
          <Field label="Project title" error={errors.projectTitle} required><input className="input" value={form.projectTitle} onChange={(e) => setForm({ ...form, projectTitle: e.target.value })} placeholder="Smart Campus Navigator" /></Field>
        </div>
        <Field label="Project description" error={errors.description}><textarea className="textarea" maxLength={1500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Required skills" error={errors.requiredSkills} hint="Skills your project needs. Coverage is measured against these."><TagInput value={skills} onChange={setSkills} placeholder="e.g. React, Node.js, Figma" /></Field>
        <Field label="Maximum team size" error={errors.maxSize} hint="Between 2 and 10, including you.">
          <select className="select" value={form.maxSize} onChange={(e) => setForm({ ...form, maxSize: e.target.value })}>
            {Array.from({ length: 9 }, (_, i) => <option key={i + 2} value={i + 2}>{i + 2} members</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

export default function TeamsPage() {
  const { data, loading, error, reload } = useApi<{ teams: Team[]; invitations: Invitation[] }>("/teams");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const toast = useToast();
  const navigate = useNavigate();

  const respond = async (inv: Invitation, action: "accept" | "decline") => {
    setBusy(inv.id);
    try {
      await api.post(`/invitations/${inv.id}/${action}`);
      toast(action === "accept" ? `You joined ${inv.teamName}!` : "Invitation declined.", action === "accept" ? "success" : "info");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="alert alert-error">{error}</div>;

  return (
    <div className="stack-lg">
      <PageHead title="Group Up" subtitle="Build stronger teams by combining the skills and strengths of your friends." actions={<Button onClick={() => setCreating(true)}><Icon name="plus" /> Create a team</Button>} />

      {data.invitations.length > 0 && (
        <section className="card card-highlight">
          <div className="card-head"><h2>Invitations for you</h2><span className="pill">{data.invitations.length}</span></div>
          <div className="list">
            {data.invitations.map((inv) => (
              <div key={inv.id} className="list-item">
                <Icon name="users" className="gold" />
                <div className="grow">
                  <div className="title">{inv.teamName} · {inv.projectTitle}</div>
                  <div className="sub">{inv.inviterName} invited you {timeAgo(inv.createdAt)}{inv.message ? `: "${inv.message}"` : ""}</div>
                </div>
                <Link className="btn btn-ghost btn-xs" to={`/teams/${inv.teamId}`}>Preview</Link>
                <Button className="btn-secondary btn-xs" loading={busy === inv.id} onClick={() => respond(inv, "decline")}>Decline</Button>
                <Button className="btn-success btn-xs" loading={busy === inv.id} onClick={() => respond(inv, "accept")}>Accept</Button>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.teams.length === 0 ? (
        <EmptyState icon="users" title="You haven't joined a group yet">
          <p className="muted small">Create a team and invite classmates by email, or accept an invitation when a classmate invites you. CampusHub then analyses your combined skills.</p>
          <Button onClick={() => setCreating(true)}>Create your first team</Button>
        </EmptyState>
      ) : (
        <div className="grid-auto">
          {data.teams.map((t) => (
            <Link key={t.id} to={`/teams/${t.id}`} className="card" style={{ display: "grid", gap: 14 }}>
              <div className="row-between">
                <h3 className="team-name" style={{ fontSize: "1.5rem" }}>{t.name}</h3>
                <span className={`pill ${t.analysis.readinessLabel === "Hackathon Ready" ? "pill-mint" : ""}`}>{t.analysis.readinessLabel}</span>
              </div>
              <p className="muted small">{t.projectTitle} · {t.members.length}/{t.maxSize} members</p>
              <div>
                <div className="row-between small"><span className="muted">Skill coverage</span><span className="gold">{t.analysis.requiredSkillCoverage?.percentage ?? t.analysis.coverage}%</span></div>
                <ProgressBar value={t.analysis.requiredSkillCoverage?.percentage ?? t.analysis.coverage} />
              </div>
              <div>
                <div className="row-between small"><span className="muted">Team readiness</span><span className="gold">{t.analysis.readiness}%</span></div>
                <ProgressBar value={t.analysis.readiness} tone="mint" />
              </div>
              {t.analysis.missingRoles.length > 0 && <p className="faint small">Missing: {t.analysis.missingRoles.map((r) => r.area).join(", ")}</p>}
            </Link>
          ))}
        </div>
      )}
      {creating && <TeamFormModal onClose={() => setCreating(false)} onSaved={(team) => { toast(`${team.name} created.`, "success"); navigate(`/teams/${team.id}`); }} />}
    </div>
  );
}

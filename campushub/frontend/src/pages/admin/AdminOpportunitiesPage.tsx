import { useState, type FormEvent } from "react";
import { Icon } from "../../components/Icon";
import { Modal } from "../../components/Modal";
import { TagInput } from "../../components/TagInput";
import { Button, ConfirmModal, ErrorAlert, Field, PageHead, PageLoading, StatusBadge } from "../../components/ui";
import { useToast } from "../../context/ToastContext";
import { useApi } from "../../hooks/useApi";
import { ApiError, api, errorMessage } from "../../services/api";
import type { ApplicationStatus, OpportunityType, SkillRef, WorkMode } from "../../types";
import { TYPE_LABELS, WORK_MODE_LABELS, formatDate } from "../../utils/format";

interface AdminOpportunity { id: string; title: string; organization: string; description: string; type: OpportunityType; eligibility: string; location: string; workMode: WorkMode; deadline: string; applicationUrl: string | null; isPublished: boolean; requiredSkills: SkillRef[]; applicationCount: number }
interface Applicant { id: string; status: ApplicationStatus; coverNote: string; createdAt: string; fullName: string; email: string; college: string | null; course: string | null; matchPercentage: number; missingSkills: string[] }

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function OpportunityForm({ opp, onClose, onSaved }: { opp: AdminOpportunity | null; onClose: () => void; onSaved: (notified: number) => void }) {
  const [form, setForm] = useState({
    title: opp?.title ?? "", organization: opp?.organization ?? "", description: opp?.description ?? "", type: opp?.type ?? "INTERNSHIP",
    eligibility: opp?.eligibility ?? "", location: opp?.location ?? "", workMode: opp?.workMode ?? "ONSITE",
    deadline: opp ? toLocalInput(opp.deadline) : toLocalInput(new Date(Date.now() + 14 * 86400000).toISOString()),
    applicationUrl: opp?.applicationUrl ?? "", isPublished: opp?.isPublished ?? true,
  });
  const [skills, setSkills] = useState<string[]>(opp?.requiredSkills.map((s) => s.name) ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form) => (v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      const body = { ...form, deadline: new Date(form.deadline).toISOString(), requiredSkills: skills };
      const res = opp ? await api.put<{ notifiedStudents: number }>(`/admin/opportunities/${opp.id}`, body) : await api.post<{ notifiedStudents: number }>("/admin/opportunities", body);
      onSaved(res.notifiedStudents);
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open size="lg" title={opp ? "Edit opportunity" : "Create opportunity"} subtitle="Students' match scores update instantly when requirements change." onClose={onClose}
      footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="opp-form" loading={saving}>{opp ? "Save changes" : "Create opportunity"}</Button></>}>
      <form id="opp-form" className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={error} />
        <div className="form-grid">
          <Field label="Title" error={errors.title} required><input className="input" value={form.title} onChange={(e) => set("title")(e.target.value)} /></Field>
          <Field label="Organization" error={errors.organization} required><input className="input" value={form.organization} onChange={(e) => set("organization")(e.target.value)} /></Field>
          <Field label="Category" error={errors.type} required>
            <select className="select" value={form.type} onChange={(e) => set("type")(e.target.value)}>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Field>
          <Field label="Work mode" error={errors.workMode} required>
            <select className="select" value={form.workMode} onChange={(e) => set("workMode")(e.target.value)}>{Object.entries(WORK_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </Field>
          <Field label="Location" error={errors.location}><input className="input" value={form.location} onChange={(e) => set("location")(e.target.value)} /></Field>
          <Field label="Application deadline" error={errors.deadline} required><input className="input" type="datetime-local" value={form.deadline} onChange={(e) => set("deadline")(e.target.value)} /></Field>
        </div>
        <Field label="Description" error={errors.description} required><textarea className="textarea" value={form.description} onChange={(e) => set("description")(e.target.value)} /></Field>
        <Field label="Eligibility criteria" error={errors.eligibility}><textarea className="textarea" style={{ minHeight: 70 }} value={form.eligibility} onChange={(e) => set("eligibility")(e.target.value)} /></Field>
        <Field label="Required skills" error={errors.requiredSkills} required hint="Used for every student's match percentage."><TagInput value={skills} onChange={setSkills} placeholder="e.g. C++, DSA, Git" /></Field>
        <Field label="External application URL (optional)" error={errors.applicationUrl}><input className="input" value={form.applicationUrl} onChange={(e) => set("applicationUrl")(e.target.value)} /></Field>
        <label className="checkbox"><input type="checkbox" checked={form.isPublished} onChange={(e) => set("isPublished")(e.target.checked)} /> Published (visible to students; strong matches get notified)</label>
      </form>
    </Modal>
  );
}

export default function AdminOpportunitiesPage() {
  const [q, setQ] = useState("");
  const { data, loading, error, reload } = useApi<{ opportunities: AdminOpportunity[] }>(`/admin/opportunities?q=${encodeURIComponent(q)}`);
  const [editing, setEditing] = useState<AdminOpportunity | "new" | null>(null);
  const [deleting, setDeleting] = useState<AdminOpportunity | null>(null);
  const [applicants, setApplicants] = useState<{ opp: AdminOpportunity; list: Applicant[] } | null>(null);
  const toast = useToast();

  const togglePublish = async (o: AdminOpportunity) => {
    try {
      const res = await api.patch<{ notifiedStudents: number }>(`/admin/opportunities/${o.id}/publish`, { isPublished: !o.isPublished });
      toast(o.isPublished ? "Opportunity unpublished." : `Published. ${res.notifiedStudents} strongly matching student(s) notified.`, "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  const showApplicants = async (o: AdminOpportunity) => {
    const res = await api.get<{ applicants: Applicant[] }>(`/admin/opportunities/${o.id}/applicants`);
    setApplicants({ opp: o, list: res.applicants });
  };

  return (
    <div>
      <PageHead title="Manage opportunities" subtitle="Create, edit, publish and remove opportunities. View applicants and their skill match." actions={<Button onClick={() => setEditing("new")}><Icon name="plus" /> New opportunity</Button>} />
      <div className="search-input" style={{ maxWidth: 420, marginBottom: 20 }}><Icon name="search" /><input className="input" placeholder="Search title or organisation" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading && !data ? <PageLoading /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Opportunity</th><th className="table-hide-sm">Category</th><th>Deadline</th><th className="table-hide-sm">Skills</th><th>Applicants</th><th>Status</th><th /></tr></thead>
            <tbody>
              {data?.opportunities.map((o) => (
                <tr key={o.id}>
                  <td><strong>{o.title}</strong><div className="faint small">{o.organization}</div></td>
                  <td className="table-hide-sm">{TYPE_LABELS[o.type]}</td>
                  <td className="nowrap">{formatDate(o.deadline)}{new Date(o.deadline) < new Date() && <div className="danger small">Closed</div>}</td>
                  <td className="table-hide-sm small">{o.requiredSkills.map((s) => s.name).join(", ")}</td>
                  <td><button type="button" className="link" onClick={() => showApplicants(o)}>{o.applicationCount}</button></td>
                  <td><button type="button" className={`pill ${o.isPublished ? "pill-mint" : "pill-muted"}`} style={{ cursor: "pointer" }} onClick={() => togglePublish(o)} title="Click to toggle">{o.isPublished ? "Published" : "Draft"}</button></td>
                  <td>
                    <div className="actions">
                      <button type="button" className="icon-btn sm" aria-label={`Edit ${o.title}`} onClick={() => setEditing(o)}><Icon name="edit" /></button>
                      <button type="button" className="icon-btn sm" aria-label={`Delete ${o.title}`} onClick={() => setDeleting(o)}><Icon name="trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <OpportunityForm opp={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async (n) => { toast(`Opportunity saved.${n ? ` ${n} matching student(s) notified.` : ""}`, "success"); setEditing(null); await reload(); }} />}
      <ConfirmModal open={Boolean(deleting)} title="Delete opportunity?" message={`Delete "${deleting?.title}"? Its ${deleting?.applicationCount ?? 0} application(s) will be closed and applicants notified.`} confirmLabel="Delete" danger onClose={() => setDeleting(null)}
        onConfirm={async () => { await api.del(`/admin/opportunities/${deleting!.id}`).catch((e) => toast(errorMessage(e), "error")); toast("Opportunity deleted.", "info"); setDeleting(null); await reload(); }} />
      {applicants && (
        <Modal open size="lg" title={`Applicants: ${applicants.opp.title}`} subtitle={`Required: ${applicants.opp.requiredSkills.map((s) => s.name).join(", ")}`} onClose={() => setApplicants(null)}>
          {applicants.list.length === 0 ? <p className="faint">No applications yet.</p> : (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Student</th><th>Match</th><th>Missing</th><th>Status</th></tr></thead>
                <tbody>
                  {applicants.list.map((a) => (
                    <tr key={a.id}>
                      <td><strong>{a.fullName}</strong><div className="faint small">{a.email} · {a.course}</div></td>
                      <td className="gold">{a.matchPercentage}%</td>
                      <td className="small">{a.missingSkills.join(", ") || "—"}</td>
                      <td><StatusBadge status={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="faint small" style={{ marginTop: 14 }}>Change statuses on the Applications page.</p>
        </Modal>
      )}
    </div>
  );
}

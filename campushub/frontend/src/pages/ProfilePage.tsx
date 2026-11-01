import { useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { TagInput } from "../components/TagInput";
import { Avatar, Button, ConfirmModal, EmptyState, ErrorAlert, Field, PageHead, PageLoading, PasswordInput, ProgressBar } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { ApiError, api, assetUrl, errorMessage } from "../services/api";
import type { Achievement, Certification, Profile, Project, StudentSkill } from "../types";
import { CATEGORY_LABELS, formatDate, toDateInput } from "../utils/format";

type Errors = Record<string, string>;

/** Runs a save call, mapping server validation errors back onto the form. */
function useSave() {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, success: string) => {
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      await fn();
      toast(success, "success");
      return true;
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setFormError(errorMessage(err));
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { saving, errors, formError, run, reset: () => { setErrors({}); setFormError(null); } };
}

export default function ProfilePage() {
  const { data, loading, error, reload } = useApi<Profile>("/profile");
  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="alert alert-error">{error ?? "Could not load your profile."}</div>;

  return (
    <div className="stack-lg">
      <PageHead title="Student Profile" subtitle="Everything here powers your opportunity matching, Group Up role and career tracker." />
      <ProfileHeader data={data} reload={reload} />
      <div className="dashboard-grid">
        <div className="stack-lg">
          <SkillsSection skills={data.skills} reload={reload} />
          <ProjectsSection projects={data.projects} reload={reload} />
          <AchievementsSection items={data.achievements} reload={reload} />
          <CertificationsSection items={data.certifications} reload={reload} />
        </div>
        <div className="stack-lg">
          <CompletionCard data={data} />
          <PrivacyCard data={data} reload={reload} />
          <LinksCard data={data} />
          <PasswordCard />
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- header + personal info */
function ProfileHeader({ data, reload }: { data: Profile; reload: () => Promise<void> }) {
  const { refresh } = useAuth();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const p = data.profile;

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast("Please choose an image smaller than 2 MB.", "error");
    setUploading(true);
    try {
      await api.upload("/profile/avatar", file);
      await Promise.all([reload(), refresh()]);
      toast("Profile picture updated.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    await api.del("/profile/avatar");
    await Promise.all([reload(), refresh()]);
    toast("Profile picture removed.", "info");
  };

  return (
    <section className="profile-card">
      <div className="profile-header">
        <div className="stack" style={{ gap: 8, justifyItems: "center" }}>
          <Avatar name={data.account.fullName} url={p.avatarUrl} size="lg" />
          <div className="row" style={{ gap: 6 }}>
            <button type="button" className="btn btn-ghost btn-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="upload" /> {uploading ? "Uploading…" : "Upload"}
            </button>
            {p.avatarUrl && <button type="button" className="btn btn-ghost btn-xs" onClick={removeAvatar}>Remove</button>}
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
        </div>
        <div className="profile-titles" style={{ flex: 1 }}>
          <h3 className="profile-name">{data.account.fullName}</h3>
          <p className="profile-course">{p.course || "Add your course"}{p.department ? ` · ${p.department}` : ""}</p>
          <p className="muted small">{p.college} · {data.account.email} {data.account.emailVerified ? <span className="pill pill-mint">Verified</span> : <span className="pill pill-amber">Email not verified</span>}</p>
          {p.semester && <p className="profile-semester">Semester: {p.semester}</p>}
          {p.bio && <p className="muted" style={{ marginTop: 10, maxWidth: "70ch" }}>{p.bio}</p>}
        </div>
        <Button className="btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" /> Edit Profile</Button>
      </div>
      <PersonalInfoModal open={editing} data={data} onClose={() => setEditing(false)} onSaved={async () => { await Promise.all([reload(), refresh()]); setEditing(false); }} />
    </section>
  );
}

function PersonalInfoModal({ open, data, onClose, onSaved }: { open: boolean; data: Profile; onClose: () => void; onSaved: () => Promise<void> }) {
  const p = data.profile;
  const initial = { fullName: data.account.fullName, college: p.college, course: p.course, department: p.department, semester: p.semester ? String(p.semester) : "", bio: p.bio, githubUrl: p.githubUrl ?? "", linkedinUrl: p.linkedinUrl ?? "", portfolioUrl: p.portfolioUrl ?? "" };
  const [form, setForm] = useState(initial);
  const { saving, errors, formError, run } = useSave();
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.put("/profile", { ...form, semester: Number(form.semester) }), "Profile updated.")) await onSaved();
  };

  return (
    <Modal open={open} size="lg" title="Edit profile" subtitle="Personal information and professional links" onClose={onClose}
      footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="personal-form" loading={saving}>Save changes</Button></>}>
      <form id="personal-form" className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={formError} />
        <div className="form-grid">
          <Field label="Full name" error={errors.fullName} required><input className="input" value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} /></Field>
          <Field label="College" error={errors.college} required><input className="input" value={form.college} onChange={(e) => set("college")(e.target.value)} /></Field>
          <Field label="Course" error={errors.course} required><input className="input" value={form.course} onChange={(e) => set("course")(e.target.value)} /></Field>
          <Field label="Department" error={errors.department}><input className="input" value={form.department} onChange={(e) => set("department")(e.target.value)} /></Field>
          <Field label="Semester" error={errors.semester} required>
            <select className="select" value={form.semester} onChange={(e) => set("semester")(e.target.value)}>
              <option value="">Select…</option>
              {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Semester {i + 1}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Short introduction" error={errors.bio} hint="At least 30 characters to count towards completion.">
          <textarea className="textarea" maxLength={600} value={form.bio} onChange={(e) => set("bio")(e.target.value)} />
        </Field>
        <div className="form-grid">
          <Field label="GitHub" error={errors.githubUrl}><input className="input" placeholder="github.com/username" value={form.githubUrl} onChange={(e) => set("githubUrl")(e.target.value)} /></Field>
          <Field label="LinkedIn" error={errors.linkedinUrl}><input className="input" placeholder="linkedin.com/in/username" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl")(e.target.value)} /></Field>
          <Field label="Portfolio" error={errors.portfolioUrl}><input className="input" placeholder="yourname.dev" value={form.portfolioUrl} onChange={(e) => set("portfolioUrl")(e.target.value)} /></Field>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- completion + links */
function CompletionCard({ data }: { data: Profile }) {
  const c = data.completion;
  return (
    <section className="card card-highlight">
      <div className="card-head"><h2>Profile completion</h2><span className="pill">{c.percentage}%</span></div>
      <ProgressBar value={c.percentage} tone={c.percentage === 100 ? "mint" : undefined} />
      <ul className="comparison-list" style={{ marginTop: 18 }}>
        {c.sections.map((s) => (
          <li key={s.key} className={s.done ? "match-success" : "match-fail"} title={s.done ? "Done" : s.tip}>
            <span aria-hidden="true">{s.done ? "✓" : "✗"}</span> {s.label} · {s.points}%
          </li>
        ))}
      </ul>
      {c.sections.some((s) => !s.done) && (
        <div style={{ marginTop: 16 }}>
          <div className="card-title-gold" style={{ marginBottom: 8 }}>Recommendations</div>
          <ul className="bullet-list small">{c.sections.filter((s) => !s.done).map((s) => <li key={s.key}>{s.tip}</li>)}</ul>
        </div>
      )}
      <p className="formula" style={{ marginTop: 14 }}>Completion = points earned ÷ 100 = <strong>{c.earned} ÷ {c.total} = {c.percentage}%</strong></p>
    </section>
  );
}

/** Who can see what: everything on this page is private except the opt-in teammate-search card. */
function PrivacyCard({ data, reload }: { data: Profile; reload: () => Promise<void> }) {
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const on = data.profile.showInDirectory;
  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      await api.patch("/profile", { showInDirectory: next });
      await reload();
      toast(next ? "Other students can now find you in teammate search." : "You are hidden from teammate search.", "success");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="card">
      <div className="card-head"><h2><Icon name="lock" className="gold" /> Privacy</h2><span className={`pill ${on ? "pill-mint" : "pill-muted"}`}>{on ? "Discoverable" : "Private"}</span></div>
      <label className="checkbox">
        <input type="checkbox" checked={on} disabled={saving} onChange={(e) => toggle(e.target.checked)} />
        <span>Show me in Group Up teammate search</span>
      </label>
      <p className="faint small" style={{ marginTop: 10 }}>
        When on, students creating a team can see your name, course, college, semester, picture and skills. Your projects, achievements,
        certifications, links, applications, career data and email are never shown to other students. Teammates you join see your name, course and skills.
      </p>
    </section>
  );
}

function LinksCard({ data }: { data: Profile }) {
  const links = [["GitHub", data.profile.githubUrl], ["LinkedIn", data.profile.linkedinUrl], ["Portfolio", data.profile.portfolioUrl]] as const;
  return (
    <section className="card">
      <div className="card-head"><h2>Links</h2></div>
      <ul className="social-links">
        {links.map(([label, url]) => (
          <li key={label}>
            {url ? <a href={url} target="_blank" rel="noopener noreferrer">{label} <Icon name="external" className="small" /></a> : <span className="chip chip-muted">{label}: not added</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PasswordCard() {
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const { saving, errors, formError, run } = useSave();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.post("/auth/change-password", form), "Password updated. Other devices were logged out.")) setForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
  };
  return (
    <section className="card">
      <div className="card-head"><h2><Icon name="lock" className="gold" /> Change password</h2></div>
      <form className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={formError} />
        <Field label="Current password" error={errors.currentPassword}><PasswordInput autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></Field>
        <Field label="New password" error={errors.newPassword} hint="8+ characters, upper & lower case and a number"><PasswordInput autoComplete="new-password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></Field>
        <Field label="Confirm new password" error={errors.confirmPassword}><PasswordInput autoComplete="new-password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} /></Field>
        <Button type="submit" className="btn-secondary" loading={saving}>Update password</Button>
      </form>
    </section>
  );
}

/* ---------------------------------------------------------------- skills */
function SkillsSection({ skills, reload }: { skills: StudentSkill[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<StudentSkill | "new" | null>(null);
  const [deleting, setDeleting] = useState<StudentSkill | null>(null);
  const toast = useToast();

  return (
    <section className="card">
      <div className="card-head">
        <h2>Technical skills <span className="faint small">({skills.length})</span></h2>
        <Button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Add skill</Button>
      </div>
      {skills.length === 0 ? (
        <EmptyState icon="target" title="No skills yet">
          <p className="muted small">Skills power your opportunity matches and Group Up role.</p>
          <Button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Add a skill</Button>
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Skill</th><th className="table-hide-sm">Category</th><th>Proficiency</th><th className="table-hide-sm">Experience</th><th /></tr></thead>
            <tbody>
              {skills.map((s) => (
                <tr key={s.id}>
                  <td><strong>{s.name}</strong><div className="faint small">{s.level}</div></td>
                  <td className="table-hide-sm"><span className="chip chip-muted">{CATEGORY_LABELS[s.category] ?? s.category}</span></td>
                  <td style={{ minWidth: 140 }}><div className="row" style={{ gap: 8, flexWrap: "nowrap" }}><ProgressBar value={s.proficiency} /><span className="gold small">{s.proficiency}%</span></div></td>
                  <td className="table-hide-sm">{s.experienceMonths ? `${s.experienceMonths} mo` : "—"}</td>
                  <td>
                    <div className="actions">
                      <button type="button" className="icon-btn sm" aria-label={`Edit ${s.name}`} onClick={() => setEditing(s)}><Icon name="edit" /></button>
                      <button type="button" className="icon-btn sm" aria-label={`Delete ${s.name}`} onClick={() => setDeleting(s)}><Icon name="trash" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <SkillModal skill={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await reload(); setEditing(null); }} />}
      <ConfirmModal
        open={Boolean(deleting)}
        title="Remove skill?"
        message={`Remove ${deleting?.name} from your profile? Your opportunity matches will be recalculated.`}
        confirmLabel="Remove"
        danger
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await api.del(`/profile/skills/${deleting!.id}`);
            toast(`${deleting!.name} removed.`, "info");
            await reload();
          } catch (e) {
            toast(errorMessage(e), "error");
          }
          setDeleting(null);
        }}
      />
    </section>
  );
}

function SkillModal({ skill, onClose, onSaved }: { skill: StudentSkill | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [names, setNames] = useState<string[]>(skill ? [skill.name] : []);
  const [proficiency, setProficiency] = useState(skill?.proficiency ?? 60);
  const [months, setMonths] = useState(skill?.experienceMonths ?? 0);
  const { saving, errors, formError, run } = useSave();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ok = skill
      ? await run(() => api.put(`/profile/skills/${skill.id}`, { proficiency, experienceMonths: months }), "Skill updated.")
      : await run(() => api.post("/profile/skills", { name: names[0] ?? "", proficiency, experienceMonths: months }), "Skill added. Matches recalculated.");
    if (ok) await onSaved();
  };

  return (
    <Modal open title={skill ? `Edit ${skill.name}` : "Add a skill"} onClose={onClose}
      footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="skill-form" loading={saving}>{skill ? "Save" : "Add skill"}</Button></>}>
      <form id="skill-form" className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={formError} />
        {!skill && (
          <Field label="Skill" error={errors.name} hint="Start typing to pick from the catalogue, or add a new skill.">
            <TagInput value={names} onChange={(v) => setNames(v.slice(-1))} max={1} placeholder="e.g. Git" />
          </Field>
        )}
        <Field label={`Proficiency: ${proficiency}%`} error={errors.proficiency} hint="0–39 Beginner · 40–64 Intermediate · 65–84 Advanced · 85+ Expert">
          <input className="range" type="range" min={0} max={100} step={5} value={proficiency} onChange={(e) => setProficiency(Number(e.target.value))} />
        </Field>
        <Field label="Experience (months)" error={errors.experienceMonths}>
          <input className="input" type="number" min={0} max={240} value={months} onChange={(e) => setMonths(Math.max(0, Number(e.target.value)))} />
        </Field>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- projects */
function ProjectsSection({ projects, reload }: { projects: Project[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Project | "new" | null>(null);
  const [deleting, setDeleting] = useState<Project | null>(null);
  const toast = useToast();

  const uploadImage = async (project: Project, file: File | undefined) => {
    if (!file) return;
    try {
      await api.upload(`/profile/projects/${project.id}/image`, file);
      toast("Project image updated.", "success");
      await reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  };

  return (
    <section className="card">
      <div className="card-head">
        <h2>Projects <span className="faint small">({projects.length})</span></h2>
        <Button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Add project</Button>
      </div>
      {projects.length === 0 ? (
        <EmptyState icon="briefcase" title="No projects yet">
          <p className="muted small">Projects carry the most weight in your portfolio.</p>
          <Button className="btn-primary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Add your first project</Button>
        </EmptyState>
      ) : (
        <div className="grid-2">
          {projects.map((p) => (
            <article key={p.id} className="project-card">
              {p.imageUrl && <img src={assetUrl(p.imageUrl) ?? undefined} alt={`${p.title} screenshot`} />}
              <div className="row-between">
                <h3 style={{ fontSize: "1.05rem" }}>{p.title}</h3>
                <div className="row" style={{ gap: 6 }}>
                  <button type="button" className="icon-btn sm" aria-label={`Edit ${p.title}`} onClick={() => setEditing(p)}><Icon name="edit" /></button>
                  <button type="button" className="icon-btn sm" aria-label={`Delete ${p.title}`} onClick={() => setDeleting(p)}><Icon name="trash" /></button>
                </div>
              </div>
              <p className="muted small">{p.description}</p>
              {p.technologies.length > 0 && <div className="chip-list">{p.technologies.map((t) => <span key={t} className="chip">{t}</span>)}</div>}
              <div className="row small">
                {p.githubUrl && <a className="link" href={p.githubUrl} target="_blank" rel="noopener noreferrer">GitHub ↗</a>}
                {p.liveUrl && <a className="link" href={p.liveUrl} target="_blank" rel="noopener noreferrer">Live demo ↗</a>}
                <label className="link" style={{ marginLeft: "auto" }}>
                  {p.imageUrl ? "Change image" : "Add image"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => uploadImage(p, e.target.files?.[0])} />
                </label>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <ProjectModal project={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={async () => { await reload(); setEditing(null); }} />}
      <ConfirmModal open={Boolean(deleting)} title="Delete project?" message={`Delete "${deleting?.title}"? This cannot be undone.`} confirmLabel="Delete" danger onClose={() => setDeleting(null)}
        onConfirm={async () => { await api.del(`/profile/projects/${deleting!.id}`).catch((e) => toast(errorMessage(e), "error")); toast("Project deleted.", "info"); setDeleting(null); await reload(); }} />
    </section>
  );
}

function ProjectModal({ project, onClose, onSaved }: { project: Project | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ title: project?.title ?? "", description: project?.description ?? "", githubUrl: project?.githubUrl ?? "", liveUrl: project?.liveUrl ?? "" });
  const [technologies, setTechnologies] = useState<string[]>(project?.technologies ?? []);
  const { saving, errors, formError, run } = useSave();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = { ...form, technologies };
    const ok = project ? await run(() => api.put(`/profile/projects/${project.id}`, body), "Project updated.") : await run(() => api.post("/profile/projects", body), "Project added.");
    if (ok) await onSaved();
  };
  return (
    <Modal open size="lg" title={project ? "Edit project" : "Add a project"} onClose={onClose}
      footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="project-form" loading={saving}>Save project</Button></>}>
      <form id="project-form" className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={formError} />
        <Field label="Project title" error={errors.title} required><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
        <Field label="Description" error={errors.description} hint="What does it do, and what did you build?" required><textarea className="textarea" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Technologies used" error={errors.technologies}><TagInput value={technologies} onChange={setTechnologies} max={15} placeholder="e.g. React, Node.js" /></Field>
        <div className="form-grid">
          <Field label="GitHub URL" error={errors.githubUrl}><input className="input" placeholder="github.com/you/project" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} /></Field>
          <Field label="Live project URL" error={errors.liveUrl}><input className="input" placeholder="project.vercel.app" value={form.liveUrl} onChange={(e) => setForm({ ...form, liveUrl: e.target.value })} /></Field>
        </div>
        <p className="hint">You can add a screenshot after saving (PNG, JPEG or WebP, up to 2 MB).</p>
      </form>
    </Modal>
  );
}

/* ---------------------------------------------------------------- achievements & certifications */
function AchievementsSection({ items, reload }: { items: Achievement[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Achievement | "new" | null>(null);
  const toast = useToast();
  return (
    <section className="card">
      <div className="card-head">
        <h2>Achievements <span className="faint small">({items.length})</span></h2>
        <Button className="btn-secondary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Add</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="sparkles" title="No achievements yet">
          <p className="muted small">Hackathons, contests, awards: add them here when you have one.</p>
        </EmptyState>
      ) : (
        <div className="list">
          {items.map((a) => (
            <div key={a.id} className="list-item">
              <Icon name="sparkles" className="gold" />
              <div className="grow"><div className="title">{a.title}</div><div className="sub">{[a.achievedOn && formatDate(a.achievedOn), a.description].filter(Boolean).join(" · ")}</div></div>
              <button type="button" className="icon-btn sm" aria-label={`Edit ${a.title}`} onClick={() => setEditing(a)}><Icon name="edit" /></button>
              <button type="button" className="icon-btn sm" aria-label={`Delete ${a.title}`} onClick={async () => { await api.del(`/profile/achievements/${a.id}`); toast("Achievement deleted.", "info"); await reload(); }}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <SimpleItemModal
          title={editing === "new" ? "Add achievement" : "Edit achievement"}
          fields={[{ key: "title", label: "Title", required: true }, { key: "description", label: "Description", textarea: true }, { key: "achievedOn", label: "Date", type: "date" }]}
          initial={editing === "new" ? {} : { title: editing.title, description: editing.description, achievedOn: toDateInput(editing.achievedOn) }}
          save={(body) => (editing === "new" ? api.post("/profile/achievements", body) : api.put(`/profile/achievements/${editing.id}`, body))}
          onClose={() => setEditing(null)}
          onSaved={async () => { await reload(); setEditing(null); }}
        />
      )}
    </section>
  );
}

function CertificationsSection({ items, reload }: { items: Certification[]; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<Certification | "new" | null>(null);
  const toast = useToast();
  return (
    <section className="card">
      <div className="card-head">
        <h2>Certifications <span className="faint small">({items.length})</span></h2>
        <Button className="btn-secondary btn-sm" onClick={() => setEditing("new")}><Icon name="plus" /> Add</Button>
      </div>
      {items.length === 0 ? (
        <EmptyState icon="shield" title="No certifications yet">
          <p className="muted small">Course certificates and credentials you add appear here.</p>
        </EmptyState>
      ) : (
        <div className="list">
          {items.map((c) => (
            <div key={c.id} className="list-item">
              <Icon name="shield" className="mint" />
              <div className="grow">
                <div className="title">{c.name}</div>
                <div className="sub">{c.issuer}{c.issueDate ? ` · ${formatDate(c.issueDate)}` : ""}{c.credentialUrl && <> · <a className="link" href={c.credentialUrl} target="_blank" rel="noopener noreferrer">Credential ↗</a></>}</div>
              </div>
              <button type="button" className="icon-btn sm" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}><Icon name="edit" /></button>
              <button type="button" className="icon-btn sm" aria-label={`Delete ${c.name}`} onClick={async () => { await api.del(`/profile/certifications/${c.id}`); toast("Certification deleted.", "info"); await reload(); }}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      {editing && (
        <SimpleItemModal
          title={editing === "new" ? "Add certification" : "Edit certification"}
          fields={[{ key: "name", label: "Certification name", required: true }, { key: "issuer", label: "Issuing organisation", required: true }, { key: "issueDate", label: "Issue date", type: "date" }, { key: "credentialUrl", label: "Credential URL" }]}
          initial={editing === "new" ? {} : { name: editing.name, issuer: editing.issuer, issueDate: toDateInput(editing.issueDate), credentialUrl: editing.credentialUrl ?? "" }}
          save={(body) => (editing === "new" ? api.post("/profile/certifications", body) : api.put(`/profile/certifications/${editing.id}`, body))}
          onClose={() => setEditing(null)}
          onSaved={async () => { await reload(); setEditing(null); }}
        />
      )}
    </section>
  );
}

interface FieldDef { key: string; label: string; required?: boolean; textarea?: boolean; type?: string }

function SimpleItemModal({ title, fields, initial, save, onClose, onSaved }: { title: string; fields: FieldDef[]; initial: Record<string, string>; save: (body: Record<string, string | null>) => Promise<unknown>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.key, initial[f.key] ?? ""])));
  const { saving, errors, formError, run } = useSave();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === "" && fields.find((f) => f.key === k)?.type === "date" ? null : v]));
    if (await run(() => save(body), "Saved.")) await onSaved();
  };
  return (
    <Modal open title={title} onClose={onClose} footer={<><Button className="btn-secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="simple-form" loading={saving}>Save</Button></>}>
      <form id="simple-form" className="form" onSubmit={submit} noValidate>
        <ErrorAlert message={formError} />
        {fields.map((f) => (
          <Field key={f.key} label={f.label} required={f.required} error={errors[f.key]}>
            {f.textarea ? (
              <textarea className="textarea" value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            ) : (
              <input className="input" type={f.type ?? "text"} value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
            )}
          </Field>
        ))}
      </form>
    </Modal>
  );
}

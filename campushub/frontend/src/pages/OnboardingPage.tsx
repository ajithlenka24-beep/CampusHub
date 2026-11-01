import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LetterHover } from "../components/LetterHover";
import { TagInput } from "../components/TagInput";
import { Button, ErrorAlert, Field, PageLoading, ProgressBar } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError, api, errorMessage } from "../services/api";
import type { Achievement, Certification, Profile, Project, User } from "../types";
import { formatDate } from "../utils/format";

interface SkillDraft { name: string; proficiency: number; experienceMonths: number }
type Errors = Record<string, string>;

const STEPS = [
  { label: "Basic information", short: "Basics", tag: "Required" },
  { label: "Skills", short: "Skills", tag: "Required" },
  { label: "Projects", short: "Projects", tag: "Optional" },
  { label: "Achievements & certifications", short: "Achievements", tag: "Optional" },
  { label: "Social links", short: "Links", tag: "Optional" },
  { label: "Profile completion", short: "Finish", tag: "Review" },
];

/** Saves one step; maps server validation errors back onto the form. */
function useStepSaver() {
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    setSaving(true);
    setErrors({});
    setError(null);
    try {
      return await fn();
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(errorMessage(err));
      return null;
    } finally {
      setSaving(false);
    }
  };
  return { saving, errors, setErrors, error, run };
}

/**
 * New-student setup, one short step at a time. Each step is saved as soon as you continue,
 * so nothing is lost if the page is closed. Only basic information and one skill are required.
 */
export default function OnboardingPage() {
  const { user, setUser, logout, refresh } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = async () => {
    const p = await api.get<Profile>("/profile");
    setProfile(p);
    return p;
  };

  useEffect(() => {
    reload().catch((e) => setLoadError(errorMessage(e)));
  }, []);

  if (loadError) return <div className="app-main"><div className="alert alert-error">{loadError}</div></div>;
  if (!profile) return <PageLoading />;

  const go = (next: number) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-main" style={{ maxWidth: 900 }}>
      <div className="row-between" style={{ marginBottom: 24 }}>
        <span className="logo-text">CampusHub</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await logout(); navigate("/login", { replace: true }); }}>
          <Icon name="logout" /> Log out
        </button>
      </div>
      <section className="hero-welcome">
        <LetterHover text={`Welcome, ${user?.fullName.split(" ")[0] ?? "student"}!`} className="gold-gradient-text" />
        <p className="sub">Let's set up your profile. Only the first two steps are required; everything else can be skipped and added later from your profile.</p>
      </section>

      <ol className="stepper stepper-6" aria-label="Onboarding progress">
        {STEPS.map((s, i) => (
          <li key={s.label} className={`step ${i === step ? "active" : i < step ? "done" : ""}`} aria-current={i === step ? "step" : undefined}>
            <span className="num">{i < step ? "✓" : i + 1}</span>
            {s.short}
          </li>
        ))}
      </ol>

      <div className="card">
        <div className="step-head">
          <h2>{STEPS[step].label}</h2>
          <span className={`pill ${STEPS[step].tag === "Required" ? "" : "pill-muted"}`}>{STEPS[step].tag}</span>
        </div>
        {step === 0 && <BasicsStep profile={profile} onDone={async () => { await Promise.all([reload(), refresh()]); go(1); }} />}
        {step === 1 && <SkillsStep profile={profile} onBack={() => go(0)} onDone={async () => { await reload(); go(2); }} />}
        {step === 2 && <ProjectsStep projects={profile.projects} reload={reload} onBack={() => go(1)} onNext={() => go(3)} />}
        {step === 3 && <AchievementsStep achievements={profile.achievements} certifications={profile.certifications} reload={reload} onBack={() => go(2)} onNext={() => go(4)} />}
        {step === 4 && <LinksStep profile={profile} onBack={() => go(3)} onDone={async () => { await reload(); go(5); }} />}
        {step === 5 && <FinishStep profile={profile} onBack={() => go(4)} onEdit={go} onFinished={(u) => { setUser(u); navigate("/dashboard", { replace: true }); }} />}
      </div>
    </div>
  );
}

function StepNav({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <div className="row-between" style={{ marginTop: 8 }}>
      <Button className="btn-secondary" disabled={!onBack} onClick={onBack}>Back</Button>
      <div className="row" style={{ gap: 10 }}>{children}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- 1. basic information (required) */
function BasicsStep({ profile, onDone }: { profile: Profile; onDone: () => Promise<void> }) {
  const p = profile.profile;
  const [form, setForm] = useState({ fullName: profile.account.fullName, college: p.college, course: p.course, department: p.department, semester: p.semester ? String(p.semester) : "", bio: p.bio });
  const { saving, errors, setErrors, error, run } = useStepSaver();
  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const local: Errors = {};
    if (form.fullName.trim().length < 2) local.fullName = "Enter your full name.";
    if (form.college.trim().length < 2) local.college = "Enter your college.";
    if (form.course.trim().length < 2) local.course = "Enter your course.";
    if (!form.semester) local.semester = "Choose your semester.";
    setErrors(local);
    if (Object.keys(local).length) return;
    const ok = await run(() => api.patch("/profile", { ...form, semester: Number(form.semester) }));
    if (ok) await onDone();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="muted small">We filled in what you gave us when you registered. Fields marked * are required.</p>
      <ErrorAlert message={error} />
      <div className="form-grid">
        <Field label="Full name" htmlFor="fullName" error={errors.fullName} required>
          <input id="fullName" className="input" autoComplete="name" value={form.fullName} onChange={(e) => set("fullName")(e.target.value)} />
        </Field>
        <Field label="College" htmlFor="college" error={errors.college} required>
          <input id="college" className="input" value={form.college} onChange={(e) => set("college")(e.target.value)} />
        </Field>
        <Field label="Course" htmlFor="course" error={errors.course} required>
          <input id="course" className="input" placeholder="B.Tech CSE" value={form.course} onChange={(e) => set("course")(e.target.value)} />
        </Field>
        <Field label="Semester" htmlFor="semester" error={errors.semester} required>
          <select id="semester" className="select" value={form.semester} onChange={(e) => set("semester")(e.target.value)}>
            <option value="">Select…</option>
            {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Semester {i + 1}</option>)}
          </select>
        </Field>
        <Field label="Department" htmlFor="department" hint="Optional" error={errors.department}>
          <input id="department" className="input" value={form.department} onChange={(e) => set("department")(e.target.value)} />
        </Field>
      </div>
      <Field label="Short introduction" htmlFor="bio" error={errors.bio} hint="Optional. What do you enjoy building? 30+ characters count towards profile completion.">
        <textarea id="bio" className="textarea" maxLength={600} value={form.bio} onChange={(e) => set("bio")(e.target.value)} placeholder="I'm a second-year CSE student who enjoys…" />
      </Field>
      <StepNav>
        <Button type="submit" loading={saving}>Save & continue</Button>
      </StepNav>
    </form>
  );
}

/* ---------------------------------------------------------------- 2. skills (at least one) */
function SkillsStep({ profile, onBack, onDone }: { profile: Profile; onBack: () => void; onDone: () => Promise<void> }) {
  const [skills, setSkills] = useState<SkillDraft[]>(profile.skills.map((s) => ({ name: s.name, proficiency: s.proficiency, experienceMonths: s.experienceMonths })));
  const { saving, errors, setErrors, error, run } = useStepSaver();

  const submit = async () => {
    if (skills.length < 1) return setErrors({ skills: "Add at least one skill. It is used to match you with opportunities and teammates." });
    const ok = await run(() => api.put("/profile/skills", { skills }));
    if (ok) await onDone();
  };

  return (
    <div className="form">
      <p className="muted small">Add the technical skills you have. CampusHub compares them with each opportunity's required skills to calculate your match. At least one is required; three or more give the best matches.</p>
      <ErrorAlert message={error} />
      <Field label="Your skills" htmlFor="skill-input" error={errors.skills} hint="Type a skill and press Enter." required>
        <TagInput
          id="skill-input"
          value={skills.map((s) => s.name)}
          max={30}
          onChange={(names) => {
            setSkills((current) => names.map((n) => current.find((c) => c.name === n) ?? { name: n, proficiency: 60, experienceMonths: 6 }));
            if (names.length && errors.skills) setErrors({});
          }}
        />
      </Field>
      {skills.length > 0 && (
        <div className="list">
          {skills.map((s, i) => (
            <div key={s.name} className="skill-row">
              <strong>{s.name}</strong>
              <div className="range-wrap">
                <input className="range" type="range" min={0} max={100} step={5} value={s.proficiency} aria-label={`${s.name} proficiency`}
                  onChange={(e) => setSkills((all) => all.map((x, j) => (j === i ? { ...x, proficiency: Number(e.target.value) } : x)))} />
                <span className="range-value">{s.proficiency}%</span>
              </div>
              <input className="input" type="number" min={0} max={240} value={s.experienceMonths} aria-label={`${s.name} months of experience`} title="Months of experience"
                onChange={(e) => setSkills((all) => all.map((x, j) => (j === i ? { ...x, experienceMonths: Math.max(0, Number(e.target.value)) } : x)))} />
              <button type="button" className="icon-btn sm" aria-label={`Remove ${s.name}`} onClick={() => setSkills((all) => all.filter((_, j) => j !== i))}>
                <Icon name="x" />
              </button>
            </div>
          ))}
          <p className="hint">Slider = proficiency. The number is months of experience.</p>
        </div>
      )}
      <StepNav onBack={onBack}>
        <Button loading={saving} onClick={submit}>Save & continue</Button>
      </StepNav>
    </div>
  );
}

/* ---------------------------------------------------------------- 3. projects (optional) */
function ProjectsStep({ projects, reload, onBack, onNext }: { projects: Project[]; reload: () => Promise<Profile>; onBack: () => void; onNext: () => void }) {
  const empty = { title: "", description: "", githubUrl: "", liveUrl: "" };
  const [form, setForm] = useState(empty);
  const [technologies, setTechnologies] = useState<string[]>([]);
  const { saving, errors, error, run } = useStepSaver();
  const toast = useToast();

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const ok = await run(() => api.post("/profile/projects", { ...form, technologies }));
    if (ok) {
      toast("Project added.", "success");
      setForm(empty);
      setTechnologies([]);
      await reload();
    }
  };
  const remove = async (p: Project) => {
    await api.del(`/profile/projects/${p.id}`).catch((err) => toast(errorMessage(err), "error"));
    await reload();
  };

  return (
    <div className="form">
      <p className="muted small">Projects carry the most weight in your portfolio. Add one now, or skip and add it later from your profile.</p>
      {projects.length === 0 ? (
        <div className="empty-inline">No projects yet. Add your first project below.</div>
      ) : (
        <div className="list">
          {projects.map((p) => (
            <div key={p.id} className="list-item">
              <Icon name="briefcase" className="gold" />
              <div className="grow"><div className="title">{p.title}</div><div className="sub">{p.technologies.join(" · ") || p.description.slice(0, 80)}</div></div>
              <button type="button" className="icon-btn sm" aria-label={`Remove ${p.title}`} onClick={() => remove(p)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      <form className="mini-form" onSubmit={add} noValidate>
        <ErrorAlert message={error} />
        <div className="form-grid">
          <Field label="Project title" htmlFor="project-title" error={errors.title} required>
            <input id="project-title" className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Technologies" error={errors.technologies} hint="Optional">
            <TagInput value={technologies} onChange={setTechnologies} max={15} placeholder="e.g. React, Node.js" />
          </Field>
        </div>
        <Field label="Description" htmlFor="project-description" error={errors.description} hint="What does it do, and what did you build? (10+ characters)" required>
          <textarea id="project-description" className="textarea" maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="form-grid">
          <Field label="GitHub URL" htmlFor="project-github" error={errors.githubUrl} hint="Optional">
            <input id="project-github" className="input" placeholder="github.com/you/project" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
          </Field>
          <Field label="Live URL" htmlFor="project-live" error={errors.liveUrl} hint="Optional">
            <input id="project-live" className="input" placeholder="project.vercel.app" value={form.liveUrl} onChange={(e) => setForm({ ...form, liveUrl: e.target.value })} />
          </Field>
        </div>
        <div><Button type="submit" className="btn-secondary btn-sm" loading={saving}><Icon name="plus" /> Add project</Button></div>
      </form>
      <StepNav onBack={onBack}>
        <Button onClick={onNext}>{projects.length ? "Continue" : "Skip for now"}</Button>
      </StepNav>
    </div>
  );
}

/* ---------------------------------------------------------------- 4. achievements & certifications (optional) */
function AchievementsStep({ achievements, certifications, reload, onBack, onNext }: { achievements: Achievement[]; certifications: Certification[]; reload: () => Promise<Profile>; onBack: () => void; onNext: () => void }) {
  const [achievement, setAchievement] = useState({ title: "", achievedOn: "", description: "" });
  const [cert, setCert] = useState({ name: "", issuer: "", issueDate: "", credentialUrl: "" });
  const a = useStepSaver();
  const c = useStepSaver();
  const toast = useToast();

  const addAchievement = async (e: FormEvent) => {
    e.preventDefault();
    if (await a.run(() => api.post("/profile/achievements", { ...achievement, achievedOn: achievement.achievedOn || null }))) {
      toast("Achievement added.", "success");
      setAchievement({ title: "", achievedOn: "", description: "" });
      await reload();
    }
  };
  const addCert = async (e: FormEvent) => {
    e.preventDefault();
    if (await c.run(() => api.post("/profile/certifications", { ...cert, issueDate: cert.issueDate || null }))) {
      toast("Certification added.", "success");
      setCert({ name: "", issuer: "", issueDate: "", credentialUrl: "" });
      await reload();
    }
  };
  const remove = async (path: string) => {
    await api.del(path).catch((err) => toast(errorMessage(err), "error"));
    await reload();
  };
  const added = achievements.length + certifications.length;

  return (
    <div className="form">
      <p className="muted small">Hackathon wins, contest ranks, course certificates… Add any you have, or skip this step.</p>
      {added === 0 ? (
        <div className="empty-inline">No achievements yet. Nothing to add? That's fine, just continue.</div>
      ) : (
        <div className="list">
          {achievements.map((x) => (
            <div key={x.id} className="list-item">
              <Icon name="sparkles" className="gold" />
              <div className="grow"><div className="title">{x.title}</div><div className="sub">Achievement{x.achievedOn ? ` · ${formatDate(x.achievedOn)}` : ""}</div></div>
              <button type="button" className="icon-btn sm" aria-label={`Remove ${x.title}`} onClick={() => remove(`/profile/achievements/${x.id}`)}><Icon name="trash" /></button>
            </div>
          ))}
          {certifications.map((x) => (
            <div key={x.id} className="list-item">
              <Icon name="shield" className="mint" />
              <div className="grow"><div className="title">{x.name}</div><div className="sub">Certification · {x.issuer}</div></div>
              <button type="button" className="icon-btn sm" aria-label={`Remove ${x.name}`} onClick={() => remove(`/profile/certifications/${x.id}`)}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
      )}
      <div className="grid-2">
        <form className="mini-form" onSubmit={addAchievement} noValidate>
          <strong>Add an achievement</strong>
          <ErrorAlert message={a.error} />
          <Field label="Title" htmlFor="achievement-title" error={a.errors.title} required>
            <input id="achievement-title" className="input" value={achievement.title} onChange={(e) => setAchievement({ ...achievement, title: e.target.value })} placeholder="Hackathon finalist" />
          </Field>
          <Field label="Date" htmlFor="achievement-date" error={a.errors.achievedOn} hint="Optional">
            <input id="achievement-date" className="input" type="date" value={achievement.achievedOn} onChange={(e) => setAchievement({ ...achievement, achievedOn: e.target.value })} />
          </Field>
          <div><Button type="submit" className="btn-secondary btn-sm" loading={a.saving}><Icon name="plus" /> Add achievement</Button></div>
        </form>
        <form className="mini-form" onSubmit={addCert} noValidate>
          <strong>Add a certification</strong>
          <ErrorAlert message={c.error} />
          <Field label="Certification name" htmlFor="cert-name" error={c.errors.name} required>
            <input id="cert-name" className="input" value={cert.name} onChange={(e) => setCert({ ...cert, name: e.target.value })} />
          </Field>
          <Field label="Issued by" htmlFor="cert-issuer" error={c.errors.issuer} required>
            <input id="cert-issuer" className="input" value={cert.issuer} onChange={(e) => setCert({ ...cert, issuer: e.target.value })} />
          </Field>
          <Field label="Issue date" htmlFor="cert-date" error={c.errors.issueDate} hint="Optional">
            <input id="cert-date" className="input" type="date" value={cert.issueDate} onChange={(e) => setCert({ ...cert, issueDate: e.target.value })} />
          </Field>
          <div><Button type="submit" className="btn-secondary btn-sm" loading={c.saving}><Icon name="plus" /> Add certification</Button></div>
        </form>
      </div>
      <StepNav onBack={onBack}>
        <Button onClick={onNext}>{added ? "Continue" : "Skip for now"}</Button>
      </StepNav>
    </div>
  );
}

/* ---------------------------------------------------------------- 5. social links (optional) */
function LinksStep({ profile, onBack, onDone }: { profile: Profile; onBack: () => void; onDone: () => Promise<void> }) {
  const p = profile.profile;
  const [form, setForm] = useState({ githubUrl: p.githubUrl ?? "", linkedinUrl: p.linkedinUrl ?? "", portfolioUrl: p.portfolioUrl ?? "" });
  const { saving, errors, error, run } = useStepSaver();
  const anyLink = Object.values(form).some((v) => v.trim());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (await run(() => api.patch("/profile", form))) await onDone();
  };

  return (
    <form className="form" onSubmit={submit} noValidate>
      <p className="muted small">Links are shown only on your own profile; other students never see them. GitHub and LinkedIn each add 10% to your profile completion.</p>
      <ErrorAlert message={error} />
      <div className="form-grid">
        <Field label="GitHub" htmlFor="github" error={errors.githubUrl} hint="Optional">
          <input id="github" className="input" placeholder="github.com/username" value={form.githubUrl} onChange={(e) => setForm({ ...form, githubUrl: e.target.value })} />
        </Field>
        <Field label="LinkedIn" htmlFor="linkedin" error={errors.linkedinUrl} hint="Optional">
          <input id="linkedin" className="input" placeholder="linkedin.com/in/username" value={form.linkedinUrl} onChange={(e) => setForm({ ...form, linkedinUrl: e.target.value })} />
        </Field>
        <Field label="Portfolio" htmlFor="portfolio" error={errors.portfolioUrl} hint="Optional">
          <input id="portfolio" className="input" placeholder="yourname.dev" value={form.portfolioUrl} onChange={(e) => setForm({ ...form, portfolioUrl: e.target.value })} />
        </Field>
      </div>
      <StepNav onBack={onBack}>
        <Button type="submit" loading={saving}>{anyLink ? "Save & continue" : "Skip for now"}</Button>
      </StepNav>
    </form>
  );
}

/* ---------------------------------------------------------------- 6. profile completion */
const STEP_FOR_SECTION: Record<string, number> = { basics: 0, semester: 0, bio: 0, skills: 1, projects: 2, achievements: 3, certifications: 3, github: 4, linkedin: 4 };

function FinishStep({ profile, onBack, onEdit, onFinished }: { profile: Profile; onBack: () => void; onEdit: (step: number) => void; onFinished: (user: User) => void }) {
  const [showInDirectory, setShowInDirectory] = useState(profile.profile.showInDirectory);
  const { saving, errors, error, run } = useStepSaver();
  const toast = useToast();
  const c = profile.completion;
  const missing = c.sections.filter((s) => !s.done);

  const finish = async () => {
    const res = await run(() => api.post<{ user: User }>("/profile/onboarding/complete", { showInDirectory }));
    if (res) {
      toast("Your profile is ready. Welcome to CampusHub!", "success");
      onFinished(res.user);
    }
  };

  return (
    <div className="form">
      <div className="row" style={{ gap: 16, alignItems: "center" }}>
        <strong style={{ fontSize: "1.6rem" }} className="gold">{c.percentage}%</strong>
        <div className="grow" style={{ flex: 1 }}><ProgressBar value={c.percentage} tone={c.percentage === 100 ? "mint" : undefined} /></div>
      </div>
      <p className="muted small">Your profile is {c.percentage}% complete. {missing.length ? "You can finish now and fill the gaps any time from your profile page." : "Everything is filled in. Great start!"}</p>
      {missing.length > 0 && (
        <ul className="comparison-list">
          {missing.map((s) => (
            <li key={s.key} className="match-fail">
              <span aria-hidden="true">✗</span> {s.tip} <span className="faint small">(+{s.points}%)</span>
              {STEP_FOR_SECTION[s.key] !== undefined && s.key !== "avatar" && (
                <button type="button" className="link small" style={{ marginLeft: 8 }} onClick={() => onEdit(STEP_FOR_SECTION[s.key])}>Add now</button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="consent-box">
        <label className="checkbox">
          <input type="checkbox" checked={showInDirectory} onChange={(e) => setShowInDirectory(e.target.checked)} />
          <span><strong>Show me in Group Up teammate search</strong> (optional)</span>
        </label>
        <p className="faint small">
          If you turn this on, other students who create a team can find you and see your name, course, college, semester, profile picture and skills.
          Your projects, achievements, certifications, links, applications and email stay private. If you leave it off, classmates can still invite you by entering your email address.
          You can change this any time on your profile page.
        </p>
      </div>

      <ErrorAlert message={error} />
      {Object.keys(errors).length > 0 && (
        <ul className="bullet-list small">{Object.values(errors).map((m) => <li key={m}>{m}</li>)}</ul>
      )}
      <StepNav onBack={onBack}>
        <Button loading={saving} onClick={finish}>Finish & go to dashboard</Button>
      </StepNav>
    </div>
  );
}

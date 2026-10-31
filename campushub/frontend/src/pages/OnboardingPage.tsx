import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LetterHover } from "../components/LetterHover";
import { TagInput } from "../components/TagInput";
import { Button, ErrorAlert, Field } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { ApiError, api } from "../services/api";
import type { Profile } from "../types";

interface SkillDraft { name: string; proficiency: number; experienceMonths: number }

/** Mandatory 3-step profile setup before the dashboard unlocks. */
export default function OnboardingPage() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ college: "", course: "", department: "", semester: "", bio: "", githubUrl: "", linkedinUrl: "" });
  const [skills, setSkills] = useState<SkillDraft[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<Profile>("/profile").then((p) => {
      setForm((f) => ({ ...f, college: p.profile.college, course: p.profile.course, department: p.profile.department, semester: p.profile.semester ? String(p.profile.semester) : "", bio: p.profile.bio }));
      setSkills(p.skills.map((s) => ({ name: s.name, proficiency: s.proficiency, experienceMonths: s.experienceMonths })));
    }).catch(() => undefined);
  }, []);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  const validateStep = (index: number) => {
    const e: Record<string, string> = {};
    if (index === 0) {
      if (form.college.trim().length < 2) e.college = "Enter your college.";
      if (form.course.trim().length < 2) e.course = "Enter your course.";
      if (!form.semester) e.semester = "Choose your semester.";
    }
    if (index === 1 && form.bio.trim().length < 30) e.bio = `Write at least 30 characters (${form.bio.trim().length}/30).`;
    if (index === 2 && skills.length < 3) e.skills = `Add at least 3 skills (${skills.length}/3).`;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const next = () => validateStep(step) && setStep((s) => s + 1);

  const finish = async () => {
    if (!validateStep(2)) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.post<{ user: typeof user }>("/profile/onboarding", { ...form, semester: Number(form.semester), skills });
      setUser(res.user);
      toast("Your profile is ready. Welcome to CampusHub!", "success");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fieldErrors());
      setError(err instanceof Error ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const steps = ["Academic details", "About you", "Your skills"];

  return (
    <div className="app-main" style={{ maxWidth: 860 }}>
      <div className="row-between" style={{ marginBottom: 24 }}>
        <span className="logo-text">CampusHub</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await logout(); navigate("/login"); }}>
          <Icon name="logout" /> Log out
        </button>
      </div>
      <section className="hero-welcome">
        <LetterHover text={`Welcome, ${user?.fullName.split(" ")[0] ?? "student"}!`} className="gold-gradient-text" />
        <p className="sub">Let's set up your profile. It takes about two minutes, and CampusHub uses it to match you with opportunities and teammates.</p>
      </section>

      <div className="stepper" aria-label="Onboarding progress">
        {steps.map((label, i) => (
          <div key={label} className={`step ${i === step ? "active" : i < step ? "done" : ""}`}>
            <span className="num">{i < step ? "✓" : i + 1}</span>
            {label}
          </div>
        ))}
      </div>

      <div className="card">
        <div className="form">
          <ErrorAlert message={error} />
          {step === 0 && (
            <div className="form-grid">
              <Field label="College" htmlFor="college" error={errors.college} required full>
                <input id="college" className="input" value={form.college} onChange={(e) => set("college")(e.target.value)} />
              </Field>
              <Field label="Course" htmlFor="course" error={errors.course} required>
                <input id="course" className="input" placeholder="B.Tech CSE" value={form.course} onChange={(e) => set("course")(e.target.value)} />
              </Field>
              <Field label="Department" htmlFor="department" hint="Optional">
                <input id="department" className="input" value={form.department} onChange={(e) => set("department")(e.target.value)} />
              </Field>
              <Field label="Semester" htmlFor="semester" error={errors.semester} required>
                <select id="semester" className="select" value={form.semester} onChange={(e) => set("semester")(e.target.value)}>
                  <option value="">Select…</option>
                  {Array.from({ length: 10 }, (_, i) => <option key={i + 1} value={i + 1}>Semester {i + 1}</option>)}
                </select>
              </Field>
            </div>
          )}

          {step === 1 && (
            <>
              <Field label="Short introduction" htmlFor="bio" error={errors.bio} hint="What do you enjoy building? What are you looking for?" required>
                <textarea id="bio" className="textarea" maxLength={600} value={form.bio} onChange={(e) => set("bio")(e.target.value)} placeholder="I'm a second-year CSE student who enjoys…" />
              </Field>
              <div className="form-grid">
                <Field label="GitHub" htmlFor="github" hint="Optional, but adds 10% to your profile" error={errors.githubUrl}>
                  <input id="github" className="input" placeholder="github.com/username" value={form.githubUrl} onChange={(e) => set("githubUrl")(e.target.value)} />
                </Field>
                <Field label="LinkedIn" htmlFor="linkedin" hint="Optional" error={errors.linkedinUrl}>
                  <input id="linkedin" className="input" placeholder="linkedin.com/in/username" value={form.linkedinUrl} onChange={(e) => set("linkedinUrl")(e.target.value)} />
                </Field>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Field label="Add your technical skills" htmlFor="skill-input" error={errors.skills} hint="Type a skill and press Enter. At least 3.">
                <TagInput
                  id="skill-input"
                  value={skills.map((s) => s.name)}
                  max={30}
                  onChange={(names) =>
                    setSkills((current) => names.map((n) => current.find((c) => c.name === n) ?? { name: n, proficiency: 60, experienceMonths: 6 }))
                  }
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
            </>
          )}

          <div className="row-between">
            <Button className="btn-secondary" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>Back</Button>
            {step < 2 ? <Button onClick={next}>Continue</Button> : <Button loading={saving} onClick={finish}>Finish & go to dashboard</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

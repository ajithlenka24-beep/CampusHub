import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { LetterHover } from "../components/LetterHover";
import { EmptyState, MatchBar, PageLoading, ProgressBar, ScoreRing, StatusBadge } from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { ApplicationStatus, Completion, Opportunity, ScorePart } from "../types";
import { TYPE_LABELS, deadlineText, formatDate, timeAgo } from "../utils/format";

interface DashboardData {
  profile: { fullName: string; avatarUrl: string | null; college: string; course: string; semester: number | null };
  completion: Completion;
  stats: { skills: number; projects: number; achievements: number; certifications: number; applications: number };
  skills: { name: string; proficiency: number; level: string }[];
  recommended: Opportunity[];
  recentApplications: { id: string; status: ApplicationStatus; updatedAt: string; title: string; organization: string }[];
  upcomingDeadlines: { id: string; title: string; organization: string; deadline: string; daysLeft: number; applied: boolean; match: number }[];
  career: { overall: number; band: string; parts: ScorePart[]; recommendations: string[]; source: string };
}

export default function DashboardPage() {
  const { data, error, loading } = useApi<DashboardData>("/dashboard");
  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="alert alert-error">{error ?? "Could not load the dashboard."}</div>;

  const firstName = data.profile.fullName.split(" ")[0];
  const missing = data.completion.sections.filter((s) => !s.done);
  const stats = [
    { label: "Profile Completion", value: `${data.completion.percentage}%`, to: "/profile", foot: missing.length ? `${missing.length} section${missing.length > 1 ? "s" : ""} to go` : "Complete" },
    { label: "Skills", value: data.stats.skills, to: "/profile", foot: "on your profile" },
    { label: "Projects", value: data.stats.projects, to: "/profile", foot: "in your portfolio" },
    { label: "Applications", value: data.stats.applications, to: "/applications", foot: "submitted" },
    { label: "Certifications", value: data.stats.certifications, to: "/profile", foot: "earned" },
  ];

  return (
    <div className="stack-lg">
      <section className="hero-welcome">
        <LetterHover text={`Welcome back, ${firstName}.`} className="gold-gradient-text" />
        <p className="sub">
          {[data.profile.course, data.profile.semester ? `Semester ${data.profile.semester}` : null, data.profile.college].filter(Boolean).join(" · ")}
        </p>
      </section>

      <section className="stats-grid" aria-label="Your numbers">
        {stats.map((s) => (
          <article key={s.label} className="stat-card">
            <h3 className="stat-title">{s.label}</h3>
            <p className="stat-value">{s.value}</p>
            <span className="stat-foot">{s.foot}</span>
            <Link className="stat-link" to={s.to} aria-label={`Open ${s.label}`} />
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <div className="stack-lg">
          <section className="card">
            <div className="card-head">
              <h2>Recommended opportunities</h2>
              <Link className="link small" to="/opportunities">Browse all →</Link>
            </div>
            {data.recommended.length === 0 ? (
              <EmptyState icon="briefcase" title="No open opportunities right now">New postings that match your skills will notify you.</EmptyState>
            ) : (
              <div className="grid-2">
                {data.recommended.map((o) => (
                  <article key={o.id} className="opportunity-card" style={{ padding: 20, gap: 14 }}>
                    <div>
                      <div className="type-row">
                        <span className="pill">{TYPE_LABELS[o.type]}</span>
                        <span className={`deadline-note ${o.daysLeft <= 3 ? "urgent" : ""}`}>{deadlineText(o.daysLeft, o.isOpen)}</span>
                      </div>
                      <h3 className="opportunity-title">{o.title}</h3>
                      <p className="opportunity-org">{o.organization}</p>
                    </div>
                    <MatchBar percentage={o.match.percentage} meta={o.match.missing.length ? `Missing: ${o.match.missing.map((s) => s.name).join(", ")}` : "You have every required skill"} />
                    <Link className="btn btn-secondary btn-sm" to={`/opportunities/${o.id}`}>View details</Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Recent application activity</h2>
              <Link className="link small" to="/applications">Open tracker →</Link>
            </div>
            {data.recentApplications.length === 0 ? (
              <EmptyState icon="clipboard" title="No applications yet"><Link className="btn btn-primary btn-sm" to="/opportunities">Find opportunities</Link></EmptyState>
            ) : (
              <div className="list">
                {data.recentApplications.map((a) => (
                  <Link key={a.id} to="/applications" className="list-item">
                    <div className="grow">
                      <div className="title">{a.title}</div>
                      <div className="sub">{a.organization} · updated {timeAgo(a.updatedAt)}</div>
                    </div>
                    <StatusBadge status={a.status} />
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Skill development</h2>
              <Link className="link small" to="/profile">Manage skills →</Link>
            </div>
            <div className="grid-2">
              {data.skills.slice().sort((a, b) => b.proficiency - a.proficiency).slice(0, 8).map((s) => (
                <div key={s.name} className="stack" style={{ gap: 8 }}>
                  <div className="row-between">
                    <strong>{s.name}</strong>
                    <span className="small"><span className="faint">{s.level}</span> · <span className="gold">{s.proficiency}%</span></span>
                  </div>
                  <ProgressBar value={s.proficiency} />
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stack-lg">
          <section className="card card-highlight">
            <div className="card-head">
              <h2>Career readiness</h2>
              <Link className="link small" to="/career">Details →</Link>
            </div>
            <div className="row" style={{ gap: 20, alignItems: "center" }}>
              <ScoreRing value={data.career.overall} size="sm" label="Career readiness" />
              <div className="stack" style={{ gap: 6, flex: 1 }}>
                <strong>{data.career.band}</strong>
                <span className="faint small">Calculated from your CampusHub data. Open Details to see how.</span>
              </div>
            </div>
            <div className="stack" style={{ marginTop: 18, gap: 10 }}>
              {data.career.parts.map((p) => (
                <div key={p.key}>
                  <div className="row-between small"><span className="muted">{p.label}</span><span className="gold">{p.score}</span></div>
                  <ProgressBar value={p.score} tone={p.score >= 75 ? "mint" : undefined} />
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2><Icon name="sparkles" className="gold" /> AI career recommendations</h2>
              <span className={`pill ${data.career.source === "rules" || data.career.source === "seed" ? "pill-muted" : "pill-mint"}`}>{data.career.source === "rules" || data.career.source === "seed" ? "Rule-based" : "AI"}</span>
            </div>
            <ul className="bullet-list">
              {data.career.recommendations.map((r) => <li key={r}>{r}</li>)}
            </ul>
          </section>

          <section className="card">
            <div className="card-head"><h2>Upcoming deadlines</h2></div>
            {data.upcomingDeadlines.length === 0 ? (
              <p className="faint small">No relevant deadlines in the next 14 days.</p>
            ) : (
              <div className="list">
                {data.upcomingDeadlines.map((d) => (
                  <Link key={d.id} to={`/opportunities/${d.id}`} className="list-item">
                    <Icon name="calendar" className={d.daysLeft <= 3 ? "danger" : "gold"} />
                    <div className="grow">
                      <div className="title">{d.title}</div>
                      <div className="sub">{formatDate(d.deadline)} · {d.applied ? "Applied" : `${d.match}% match`}</div>
                    </div>
                    <span className={`pill ${d.daysLeft <= 3 ? "pill-red" : ""}`}>{d.daysLeft}d</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {missing.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Complete your profile</h2><span className="pill">{data.completion.percentage}%</span></div>
              <ProgressBar value={data.completion.percentage} />
              <ul className="bullet-list" style={{ marginTop: 16 }}>
                {missing.slice(0, 4).map((s) => <li key={s.key}>{s.tip} <span className="faint small">(+{s.points}%)</span></li>)}
              </ul>
              <Link className="btn btn-secondary btn-sm" style={{ marginTop: 16 }} to="/profile">Update profile</Link>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

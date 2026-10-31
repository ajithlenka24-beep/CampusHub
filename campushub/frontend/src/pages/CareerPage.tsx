import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Button, PageHead, PageLoading, ProgressBar, ScoreRing } from "../components/ui";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage } from "../services/api";
import type { AiStatus, Completion, ScorePart } from "../types";
import { formatDate, formatDateTime } from "../utils/format";

interface CareerData {
  metrics: {
    overall: number;
    band: string;
    disclaimer: string;
    formula: string;
    parts: ScorePart[];
    completion: Completion;
    skills: { name: string; proficiency: number; level: string; experienceMonths: number }[];
    strongSkills: string[];
    weakSkills: string[];
    portfolio: { projects: number; certifications: number; achievements: number };
    applications: { total: number; byStatus: Record<string, number> };
    topMatches: { id: string; title: string; organization: string; percentage: number; missing: string[]; applied: boolean }[];
    recommendedSkills: { name: string; count: number; opportunities: string[] }[];
    missingSkills: string[];
  };
  goals: { id: string; title: string; detail: string; category: string; status: "OPEN" | "DONE" }[];
  history: { date: string; overall: number; skills: number; profile: number; portfolio: number }[];
  recommendations: { items: string[]; source: string; generatedAt: string | null };
  ai: AiStatus;
}

/** Simple SVG line chart of the readiness indicator over time (no chart library). */
function HistoryChart({ points }: { points: { date: string; overall: number; skills: number }[] }) {
  if (points.length < 2) return <p className="faint small">Your progress chart appears after your second analysis. Use "Refresh analysis" to save today's snapshot.</p>;
  const w = 560, h = 160, pad = 24;
  const x = (i: number) => pad + (i * (w - pad * 2)) / (points.length - 1);
  const y = (v: number) => h - pad - (v / 100) * (h - pad * 2);
  const line = (key: "overall" | "skills") => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  return (
    <figure>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Career readiness over time">
        {[0, 50, 100].map((v) => <line key={v} x1={pad} x2={w - pad} y1={y(v)} y2={y(v)} stroke="rgba(255,255,255,0.08)" />)}
        <path d={line("skills")} fill="none" stroke="var(--mint)" strokeWidth="2" strokeDasharray="4 4" />
        <path d={line("overall")} fill="none" stroke="var(--gold)" strokeWidth="2.5" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.overall)} r="3.5" fill="var(--gold)"><title>{`${formatDate(p.date)}: ${p.overall}`}</title></circle>)}
      </svg>
      <figcaption className="row small faint"><span className="gold">━ Readiness indicator</span><span className="mint">┅ Skill strength</span></figcaption>
    </figure>
  );
}

export default function CareerPage() {
  const { data, loading, error, reload, setData } = useApi<CareerData>("/career");
  const [refreshing, setRefreshing] = useState(false);
  const toast = useToast();

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="alert alert-error">{error}</div>;
  const m = data.metrics;
  const isAi = !["rules", "seed", ""].includes(data.recommendations.source);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.post("/career/refresh");
      await reload();
      toast("Career analysis refreshed and saved to your progress history.", "success");
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setRefreshing(false);
    }
  };

  const toggleGoal = async (goalId: string, done: boolean) => {
    setData({ ...data, goals: data.goals.map((g) => (g.id === goalId ? { ...g, status: done ? "DONE" : "OPEN" } : g)) });
    await api.patch(`/career/goals/${goalId}`, { status: done ? "DONE" : "OPEN" }).catch(() => reload());
  };
  const doneGoals = data.goals.filter((g) => g.status === "DONE").length;

  return (
    <div className="stack-lg">
      <PageHead title="AI Career Progress Tracker" subtitle="Measured scores come straight from your CampusHub data. Written advice is generated separately and clearly labelled." actions={<Button loading={refreshing} onClick={refresh}><Icon name="refresh" /> Refresh analysis</Button>} />

      <div className="dashboard-grid">
        <section className="card card-highlight">
          <div className="card-head"><h2>Career readiness indicator</h2><span className="pill">{m.band}</span></div>
          <div className="row" style={{ gap: 28, alignItems: "center" }}>
            <ScoreRing value={m.overall} size="lg" label="Career readiness" />
            <div className="stack" style={{ flex: 1, minWidth: 240, gap: 12 }}>
              {m.parts.map((p) => (
                <div key={p.key}>
                  <div className="row-between small"><span>{p.label} <span className="faint">× {p.weight * 100}%</span></span><span className="gold">{p.score}</span></div>
                  <ProgressBar value={p.score} tone={p.score >= 75 ? "mint" : p.score < 40 ? "amber" : undefined} />
                  <span className="faint small">{p.formula}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="formula" style={{ marginTop: 18 }}><strong>{m.formula}</strong></p>
          <p className="faint small" style={{ marginTop: 6 }}>{m.disclaimer}</p>
        </section>

        <section className="card">
          <div className="card-head">
            <h2><Icon name="sparkles" className="gold" /> Personalised recommendations</h2>
            <span className={`pill ${isAi ? "pill-mint" : "pill-muted"}`}>{isAi ? `AI · ${data.recommendations.source.split(":")[0]}` : "Rule-based"}</span>
          </div>
          <ul className="bullet-list">{data.recommendations.items.map((r) => <li key={r}>{r}</li>)}</ul>
          <p className="faint small" style={{ marginTop: 14 }}>
            {isAi ? "Generated by AI from your measured data only." : data.ai.mode === "ai" ? "Click Refresh analysis to generate AI recommendations." : "No AI provider is configured, so these come from CampusHub's built-in rules."}
            {data.recommendations.generatedAt && ` Updated ${formatDateTime(data.recommendations.generatedAt)}.`}
          </p>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>This week's goals</h2><span className="pill pill-mint">{doneGoals}/{data.goals.length} done</span></div>
          {data.goals.length === 0 ? <p className="faint">You're on top of everything. Great work!</p> : (
            <div className="list">
              {data.goals.map((g) => (
                <label key={g.id} className={`goal ${g.status === "DONE" ? "done" : ""}`}>
                  <input type="checkbox" checked={g.status === "DONE"} onChange={(e) => toggleGoal(g.id, e.target.checked)} />
                  <span><span className="goal-title">{g.title}</span><span className="faint small" style={{ display: "block" }}>{g.detail}</span></span>
                </label>
              ))}
            </div>
          )}
          <p className="faint small" style={{ marginTop: 12 }}>Goals are generated each week from gaps in your measured data.</p>
        </section>

        <section className="card">
          <div className="card-head"><h2>Progress over time</h2></div>
          <HistoryChart points={data.history} />
        </section>
      </div>

      <div className="grid-3">
        <section className="card">
          <div className="card-head"><h2>Recommended skills</h2></div>
          {m.recommendedSkills.length === 0 ? <p className="faint small">You have every skill the open opportunities ask for.</p> : (
            <div className="list">
              {m.recommendedSkills.map((s) => (
                <div key={s.name} className="list-item" title={s.opportunities.join(", ")}>
                  <div className="grow"><div className="title">{s.name}</div><div className="sub">Needed by {s.count} open opportunit{s.count === 1 ? "y" : "ies"}</div></div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Skill development</h2></div>
          <div className="stack" style={{ gap: 10 }}>
            {m.skills.slice().sort((a, b) => b.proficiency - a.proficiency).map((s) => (
              <div key={s.name}>
                <div className="row-between small"><span>{s.name} <span className="faint">· {s.level}</span></span><span className="gold">{s.proficiency}%</span></div>
                <ProgressBar value={s.proficiency} tone={s.proficiency >= 75 ? "mint" : s.proficiency < 50 ? "amber" : undefined} />
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Portfolio & applications</h2></div>
          <div className="kv">
            <div><span className="k">Projects</span><span className="v">{m.portfolio.projects}</span></div>
            <div><span className="k">Certifications</span><span className="v">{m.portfolio.certifications}</span></div>
            <div><span className="k">Achievements</span><span className="v">{m.portfolio.achievements}</span></div>
            <div><span className="k">Applications</span><span className="v">{m.applications.total}</span></div>
          </div>
          {m.missingSkills.length > 0 && (
            <>
              <div className="card-title-gold" style={{ margin: "18px 0 10px" }}>Missing from your top matches</div>
              <div className="chip-list">{m.missingSkills.map((s) => <span key={s} className="chip chip-red">{s}</span>)}</div>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Your best open matches</h2><Link className="link small" to="/opportunities">All opportunities →</Link></div>
        <div className="list">
          {m.topMatches.map((t) => (
            <Link key={t.id} to={`/opportunities/${t.id}`} className="list-item">
              <div className="grow"><div className="title">{t.title}</div><div className="sub">{t.organization}{t.missing.length ? ` · missing ${t.missing.join(", ")}` : " · all skills matched"}</div></div>
              {t.applied && <span className="pill pill-mint">Applied</span>}
              <span className="pill">{t.percentage}%</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

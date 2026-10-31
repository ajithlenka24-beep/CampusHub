import { Link } from "react-router-dom";
import { PageHead, PageLoading, ProgressBar } from "../../components/ui";
import { useApi } from "../../hooks/useApi";
import type { ApplicationStatus } from "../../types";
import { STATUS_LABELS, timeAgo } from "../../utils/format";

interface Stats {
  totals: { students: number; opportunities: number; publishedOpportunities: number; applications: number; teams: number };
  applicationsByStatus: Partial<Record<ApplicationStatus, number>>;
  recentActivity: { id: number; action: string; entityType: string; details: Record<string, string>; createdAt: string; actorName: string | null }[];
}

export const describeActivity = (action: string, details: Record<string, string>) => {
  const label = action.toLowerCase().replace(/_/g, " ");
  const subject = details.title ?? details.opportunity ?? details.name ?? "";
  return `${label.charAt(0).toUpperCase() + label.slice(1)}${subject ? `: ${subject}` : ""}${details.to ? ` → ${details.to.toLowerCase()}` : ""}`;
};

export default function AdminDashboardPage() {
  const { data, loading, error } = useApi<Stats>("/admin/stats");
  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="alert alert-error">{error}</div>;
  const t = data.totals;
  const statusTotal = Object.values(data.applicationsByStatus).reduce((s, n) => s + (n ?? 0), 0) || 1;

  return (
    <div className="stack-lg">
      <PageHead title="Admin overview" subtitle="Platform-wide numbers, straight from the database." actions={<Link className="btn btn-primary" to="/admin/opportunities">Manage opportunities</Link>} />
      <section className="stats-grid">
        {[
          ["Registered students", t.students, "/admin/students"],
          ["Opportunities", t.opportunities, "/admin/opportunities"],
          ["Published", t.publishedOpportunities, "/admin/opportunities"],
          ["Applications", t.applications, "/admin/applications"],
          ["Teams", t.teams, "/admin/teams"],
        ].map(([label, value, to]) => (
          <article key={label as string} className="stat-card">
            <h3 className="stat-title">{label}</h3>
            <p className="stat-value">{value}</p>
            <Link className="stat-link" to={to as string} aria-label={`Open ${label}`} />
          </article>
        ))}
      </section>
      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Applications by status</h2><Link className="link small" to="/admin/applications">Review →</Link></div>
          <div className="stack">
            {(["APPLIED", "SHORTLISTED", "INTERVIEW", "SELECTED", "REJECTED", "WITHDRAWN"] as ApplicationStatus[]).map((s) => {
              const n = data.applicationsByStatus[s] ?? 0;
              return (
                <div key={s}>
                  <div className="row-between small"><span>{STATUS_LABELS[s]}</span><span className="gold">{n}</span></div>
                  <ProgressBar value={(n / statusTotal) * 100} tone={s === "SELECTED" ? "mint" : s === "REJECTED" ? "amber" : undefined} />
                </div>
              );
            })}
          </div>
        </section>
        <section className="card">
          <div className="card-head"><h2>Recent platform activity</h2><Link className="link small" to="/admin/activity">Full log →</Link></div>
          <div className="list">
            {data.recentActivity.map((a) => (
              <div key={a.id} className="list-item">
                <div className="grow"><div className="title small">{describeActivity(a.action, a.details)}</div><div className="sub">{a.actorName ?? "System"} · {timeAgo(a.createdAt)}</div></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

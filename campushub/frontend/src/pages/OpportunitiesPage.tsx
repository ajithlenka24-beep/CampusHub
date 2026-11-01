import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { EmptyState, MatchBar, PageHead, PageLoading } from "../components/ui";
import { useApi } from "../hooks/useApi";
import type { Opportunity } from "../types";
import { TYPE_LABELS, WORK_MODE_LABELS, deadlineText, formatDate } from "../utils/format";
import { ApplyModal } from "./OpportunityDetailPage";

export default function OpportunitiesPage() {
  const [filters, setFilters] = useState({ q: "", type: "", workMode: "", skill: "", deadline: "all", sort: "match", includeClosed: false });
  const [query, setQuery] = useState("");
  const [applyTo, setApplyTo] = useState<Opportunity | null>(null);

  // debounce typing so we don't call the API on every keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== "" && v !== false && !(k === "deadline" && v === "all")) params.set(k, String(v));
      });
      setQuery(params.toString());
    }, 250);
    return () => clearTimeout(timer);
  }, [filters]);

  const { data, loading, error, reload } = useApi<{ opportunities: Opportunity[]; total: number }>(`/opportunities?${query}`);
  const set = (key: keyof typeof filters) => (value: string | boolean) => setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div>
      <PageHead title="Opportunities" subtitle="Internships, hackathons, workshops, research and more, ranked by how well your skills match." />
      <div className="toolbar">
        <div className="search-input">
          <Icon name="search" />
          <input className="input" placeholder="Search title, organisation or keyword" aria-label="Search opportunities" value={filters.q} onChange={(e) => set("q")(e.target.value)} />
        </div>
        <select className="select" aria-label="Category" value={filters.type} onChange={(e) => set("type")(e.target.value)}>
          <option value="">All categories</option>
          {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="input" placeholder="Required skill (e.g. Python)" aria-label="Filter by skill" value={filters.skill} onChange={(e) => set("skill")(e.target.value)} />
        <select className="select" aria-label="Deadline" value={filters.deadline} onChange={(e) => set("deadline")(e.target.value)}>
          <option value="all">Any deadline</option>
          <option value="7">Closing within 7 days</option>
          <option value="30">Closing within 30 days</option>
        </select>
        <select className="select" aria-label="Work mode" value={filters.workMode} onChange={(e) => set("workMode")(e.target.value)}>
          <option value="">Any work mode</option>
          {Object.entries(WORK_MODE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select className="select" aria-label="Sort" value={filters.sort} onChange={(e) => set("sort")(e.target.value)}>
          <option value="match">Best match first</option>
          <option value="newest">Newest first</option>
          <option value="deadline">Deadline soonest</option>
        </select>
        <label className="checkbox" style={{ alignSelf: "center" }}>
          <input type="checkbox" checked={filters.includeClosed} onChange={(e) => set("includeClosed")(e.target.checked)} /> Show closed
        </label>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {loading && !data ? <PageLoading /> : data && data.opportunities.length === 0 ? (
        query === "" || query === "sort=match" ? (
          <EmptyState icon="briefcase" title="No open opportunities yet">Internships, hackathons and events posted by your placement cell will appear here, ranked by your skill match.</EmptyState>
        ) : (
          <EmptyState icon="search" title="No opportunities match these filters">Try clearing a filter or searching for something else.</EmptyState>
        )
      ) : (
        <>
          <p className="faint small" style={{ marginBottom: 14 }}>{data?.total ?? 0} result{data?.total === 1 ? "" : "s"}</p>
          <div className="opportunities-grid">
            {data?.opportunities.map((o) => (
              <article key={o.id} className="opportunity-card">
                <header className="opportunity-header">
                  <div className="type-row">
                    <span className="pill">{TYPE_LABELS[o.type]}</span>
                    {o.application ? <span className="pill pill-mint">Applied</span> : !o.isOpen ? <span className="pill pill-red">Closed</span> : null}
                  </div>
                  <h3 className="opportunity-title">{o.title}</h3>
                  <p className="opportunity-org">Organization: {o.organization}</p>
                </header>
                <div className="opportunity-details">
                  <p><strong>Work mode:</strong> <span>{WORK_MODE_LABELS[o.workMode]}{o.location ? ` · ${o.location}` : ""}</span></p>
                  <p><strong>Deadline:</strong> <span>{formatDate(o.deadline)} <span className={`deadline-note ${o.isOpen && o.daysLeft <= 3 ? "urgent" : ""}`}>· {deadlineText(o.daysLeft, o.isOpen)}</span></span></p>
                  <div className="skill-chips">
                    {o.requiredSkills.map((s) => {
                      const has = o.match.matched.some((m) => m.id === s.id);
                      return <span key={s.id} className={`chip ${has ? "chip-mint" : "chip-red"}`}>{has ? "✓" : "✗"} {s.name}</span>;
                    })}
                  </div>
                </div>
                <MatchBar percentage={o.match.percentage} meta={`${o.match.matched.length} of ${o.match.requiredCount} required skills`} />
                <footer className="opportunity-actions">
                  <Link className="btn btn-secondary" to={`/opportunities/${o.id}`}>View Details</Link>
                  {o.application ? (
                    <Link className="btn btn-success" to="/applications">✓ Applied</Link>
                  ) : (
                    <button type="button" className="btn btn-primary" disabled={!o.isOpen} onClick={() => setApplyTo(o)}>{o.isOpen ? "Apply" : "Closed"}</button>
                  )}
                </footer>
              </article>
            ))}
          </div>
        </>
      )}
      {applyTo && <ApplyModal opportunity={applyTo} onClose={() => setApplyTo(null)} onApplied={async () => { setApplyTo(null); await reload(); }} />}
    </div>
  );
}

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Avatar, Button, ConfirmModal, PageLoading } from "../components/ui";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useApi } from "../hooks/useApi";
import { api, errorMessage } from "../services/api";
import type { Team } from "../types";
import { timeAgo } from "../utils/format";
import { TeamFormModal } from "./TeamsPage";

interface Candidate { id: string; fullName: string; course: string; avatarUrl: string | null; skills: { name: string; proficiency: number }[]; recommendedRole: string; fit: { fillsSkills: string[]; fillsRoles: string[]; recommendedRole: string; score: number } }
interface TeamResponse { team: Team; isOwner: boolean; isMember: boolean; pendingInvitations: { id: string; inviteeId: string; inviteeName: string; createdAt: string }[] }

const AREAS = ["Frontend", "Backend", "Database", "AI/ML", "UI/UX", "Testing", "DevOps"];

export default function TeamDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<TeamResponse>(`/teams/${id}`);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"leave" | "delete" | { remove: string; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [inviting, setInviting] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  const loadCandidates = async (q = search) => {
    if (!data?.isOwner) return;
    try {
      const res = await api.get<{ candidates: Candidate[] }>(`/teams/${id}/suggestions?q=${encodeURIComponent(q)}`);
      setCandidates(res.candidates);
    } catch {
      setCandidates([]);
    }
  };

  useEffect(() => {
    if (data?.isOwner) void loadCandidates("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.isOwner, data?.team.members.length]);

  if (loading && !data) return <PageLoading />;
  if (error || !data) return <div className="stack"><div className="alert alert-error">{error ?? "Team not found."}</div><Link className="link" to="/teams">← Back to Group Up</Link></div>;
  const { team, isOwner, isMember } = data;
  const a = team.analysis;
  const coverageValue = a.requiredSkillCoverage?.percentage ?? a.coverage;
  const seatsLeft = team.maxSize - team.members.length - data.pendingInvitations.length;

  const invite = async (c: Candidate) => {
    setInviting(c.id);
    try {
      await api.post(`/teams/${team.id}/invitations`, { inviteeId: c.id, message: `Join ${team.name} to work on ${team.projectTitle}!` });
      toast(`Invitation sent to ${c.fullName}.`, "success");
      await reload();
      await loadCandidates();
    } catch (e) {
      toast(errorMessage(e), "error");
    } finally {
      setInviting(null);
    }
  };

  /** Invite any classmate who has a CampusHub account, by their email address. */
  const inviteByEmail = async (e: FormEvent) => {
    e.preventDefault();
    const address = inviteEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(address)) return setEmailError("Enter your classmate's email address.");
    setEmailError(null);
    setInviting("email");
    try {
      const res = await api.post<{ invitation: { inviteeName: string } }>(`/teams/${team.id}/invitations`, { email: address, message: `Join ${team.name} to work on ${team.projectTitle}!` });
      toast(`Invitation sent to ${res.invitation.inviteeName}.`, "success");
      setInviteEmail("");
      await reload();
      await loadCandidates();
    } catch (err) {
      setEmailError(errorMessage(err));
    } finally {
      setInviting(null);
    }
  };

  // every skill the members really have (read live from their profiles), with who has it
  const teamSkills = Object.values(
    team.members.reduce<Record<string, { name: string; owners: string[]; best: number }>>((acc, m) => {
      for (const s of m.skills) {
        const key = s.name.toLowerCase();
        acc[key] ??= { name: s.name, owners: [], best: 0 };
        acc[key].owners.push(m.fullName);
        acc[key].best = Math.max(acc[key].best, s.proficiency);
      }
      return acc;
    }, {}),
  ).sort((x, y) => y.owners.length - x.owners.length || y.best - x.best || x.name.localeCompare(y.name));

  const doConfirm = async () => {
    try {
      if (confirm === "leave") {
        await api.post(`/teams/${team.id}/leave`);
        toast(`You left ${team.name}.`, "info");
        navigate("/teams");
      } else if (confirm === "delete") {
        await api.del(`/teams/${team.id}`);
        toast(`${team.name} deleted.`, "info");
        navigate("/teams");
      } else if (confirm) {
        await api.del(`/teams/${team.id}/members/${confirm.remove}`);
        toast(`${confirm.name} removed from the team.`, "info");
        await reload();
      }
    } catch (e) {
      toast(errorMessage(e), "error");
    }
    setConfirm(null);
  };

  const setMyRole = async (roleArea: string) => {
    await api.put(`/teams/${team.id}/members/me`, { roleArea });
    toast("Your team role was updated.", "success");
    await reload();
  };

  const me = team.members.find((m) => m.userId === user?.id);

  return (
    <div className="stack-lg">
      <Link className="link small" to="/teams">← Group Up</Link>
      <article className="team-preview-card" style={{ gridTemplateAreas: '"header header" "members stats" "actions actions"' }}>
        <header className="team-header">
          <div className="row-between">
            <h1 className="team-name">{team.name}</h1>
            <span className={`pill ${a.readinessLabel === "Hackathon Ready" ? "pill-mint" : a.readinessLabel === "Almost Ready" ? "" : "pill-amber"}`}>{a.readinessLabel}</span>
          </div>
          <p className="muted" style={{ marginTop: 8 }}><strong className="gold">{team.projectTitle}</strong>{team.description ? ` · ${team.description}` : ""}</p>
          {!isMember && <div className="alert alert-info small" style={{ marginTop: 12 }}>You've been invited to this team. Accept the invitation on the Group Up page.</div>}
        </header>

        <div className="team-members">
          <h4 className="team-subtitle">Members ({team.members.length}/{team.maxSize}):</h4>
          <ul className="member-list">
            {team.members.map((m) => (
              <li key={m.userId} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <Avatar name={m.fullName} url={m.avatarUrl} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong>{m.fullName}</strong> — {m.roleLabel}
                  {m.isOwner && <span className="pill" style={{ marginLeft: 8 }}>Owner</span>}
                  {m.userId === user?.id && <span className="pill pill-mint" style={{ marginLeft: 8 }}>You</span>}
                  <span className="faint small" style={{ display: "block" }}>{m.skills.map((s) => s.name).join(" · ") || "No skills listed"}</span>
                </div>
                {isOwner && !m.isOwner && (
                  <button type="button" className="icon-btn sm" aria-label={`Remove ${m.fullName}`} onClick={() => setConfirm({ remove: m.userId, name: m.fullName })}><Icon name="x" /></button>
                )}
              </li>
            ))}
          </ul>
          {me && (
            <div className="field" style={{ marginTop: 16, maxWidth: 320 }}>
              <label className="label" htmlFor="my-role">My role in this team</label>
              <select id="my-role" className="select" value={me.roleArea} onChange={(e) => setMyRole(e.target.value)}>
                <option value="">Auto-detect from my skills</option>
                {AREAS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="team-stats">
          <div className="team-stat" style={{ "--pct": coverageValue } as CSSProperties}>
            <span className="stat-label">{a.requiredSkillCoverage ? "Required-skill coverage:" : "Team Skill Coverage:"}</span>
            <span className="stat-value">{coverageValue}%</span>
          </div>
          <div className="team-stat" style={{ "--pct": a.readiness } as CSSProperties}>
            <span className="stat-label">Team Readiness:</span>
            <span className="stat-value">{a.readiness}%</span>
          </div>
          <div className="team-stat" style={{ "--pct": a.coverage } as CSSProperties}>
            <span className="stat-label">Skill-area coverage (7 areas):</span>
            <span className="stat-value">{a.coverage}%</span>
          </div>
        </div>

        {isMember && (
          <footer className="team-actions" style={{ gap: 12, flexWrap: "wrap" }}>
            {isOwner && <Button className="btn-secondary" onClick={() => setEditing(true)}><Icon name="edit" /> Edit team</Button>}
            <Button className="btn-ghost" onClick={() => setConfirm("leave")}>Leave team</Button>
            {isOwner && <Button className="btn-danger" onClick={() => setConfirm("delete")}><Icon name="trash" /> Delete team</Button>}
          </footer>
        )}
      </article>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>Skill-area coverage ({a.areaCoverage.filter((x) => x.covered).length}/7)</h2></div>
          <ul className="comparison-list">
            {a.areaCoverage.map((x) => (
              <li key={x.area} className={x.covered ? "match-success" : "match-fail"} title={x.covered ? `Covered by: ${x.skills.join(", ")}` : "No team member has these skills"}>
                <span aria-hidden="true">{x.covered ? "✓" : "✗"}</span> {x.area}
              </li>
            ))}
          </ul>
          {a.requiredSkillCoverage && (
            <>
              <div className="card-title-gold" style={{ margin: "20px 0 10px" }}>Required project skills</div>
              <ul className="comparison-list">
                {a.requiredSkillCoverage.matched.map((s) => <li key={s} className="match-success"><span aria-hidden="true">✓</span> {s}</li>)}
                {a.requiredSkillCoverage.missing.map((s) => <li key={s} className="match-fail"><span aria-hidden="true">✗</span> {s}</li>)}
              </ul>
            </>
          )}
          <div className="card-title-gold" style={{ margin: "20px 0 10px" }}>Missing roles</div>
          <ul className="comparison-list">
            {a.missingRoles.length ? a.missingRoles.map((r) => <li key={r.area} className="match-fail"><span aria-hidden="true">✗</span> {r.role}{r.critical ? " (critical)" : ""}</li>) : <li className="match-success">✓ Every role has an owner</li>}
          </ul>
        </section>

        <section className="card card-highlight">
          <div className="card-head"><h2>CampusHub recommendation</h2></div>
          <p style={{ fontSize: "1.02rem" }}>{a.summary}</p>
          <ul className="bullet-list" style={{ marginTop: 14 }}>{a.recommendations.map((r) => <li key={r}>{r}</li>)}</ul>
          <details className="explain" style={{ marginTop: 18 }}>
            <summary>How are these scores calculated?</summary>
            <p>Skill-area coverage = areas with at least one team skill ÷ 7 × 100 = {a.coverage}%.</p>
            {a.requiredSkillCoverage && <p>Required-skill coverage = required skills someone in the team has ÷ required skills × 100 = {a.requiredSkillCoverage.percentage}%.</p>}
            <p>Readiness = {a.readinessParts.map((p) => `${p.weight} × ${p.label} (${p.score})`).join(" + ")} = {a.readiness}%.</p>
            <p>Team size counts towards 5 members. Role diversity = different roles ÷ members. Critical roles = Frontend, Backend and Database owners. Roles are detected from each member's skills unless they choose one.</p>
          </details>
        </section>
      </div>

      <section className="card">
        <div className="card-head">
          <h2>Team skills</h2>
          <span className="faint small">{teamSkills.length} skill{teamSkills.length === 1 ? "" : "s"} across {team.members.length} member{team.members.length === 1 ? "" : "s"}</span>
        </div>
        {teamSkills.length === 0 ? (
          <p className="faint">No skills listed yet. Members add skills on their own profile pages.</p>
        ) : (
          <div className="chip-list">
            {teamSkills.map((s) => (
              <span key={s.name} className={`chip ${s.owners.length > 1 ? "chip-mint" : ""}`} title={`${s.owners.join(", ")} · best ${s.best}%`}>
                {s.name} <span className="faint small">· {s.owners.length > 1 ? `${s.owners.length} members` : s.owners[0]}</span>
              </span>
            ))}
          </div>
        )}
        <p className="faint small" style={{ marginTop: 12 }}>Taken live from each member's own profile, so the analysis updates when a teammate adds or improves a skill.</p>
      </section>

      {isOwner && (
        <section className="card">
          <div className="card-head">
            <h2>Find teammates</h2>
            <span className="faint small">{seatsLeft > 0 ? `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} available` : "Team is full"}</span>
          </div>
          <form className="stack" style={{ gap: 8, marginBottom: 22 }} onSubmit={inviteByEmail} noValidate>
            <label className="label" htmlFor="invite-email">Invite a classmate by email</label>
            <div className="row">
              <input id="invite-email" className="input" style={{ flex: 1, minWidth: 220 }} type="email" autoComplete="off" placeholder="classmate@college.edu" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} aria-invalid={Boolean(emailError)} />
              <Button type="submit" disabled={seatsLeft <= 0} loading={inviting === "email"}><Icon name="send" /> Send invitation</Button>
            </div>
            {emailError ? <span className="field-error" role="alert">{emailError}</span> : <span className="hint">They need a CampusHub student account. They'll see the invitation under Group Up and in their notifications.</span>}
          </form>
          <div className="card-title-gold" style={{ marginBottom: 10 }}>Suggested students</div>
          <form className="row" style={{ marginBottom: 18 }} onSubmit={(e) => { e.preventDefault(); void loadCandidates(); }}>
            <div className="search-input" style={{ flex: 1, minWidth: 220 }}>
              <Icon name="search" />
              <input className="input" placeholder="Search by name, college or course" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Button type="submit" className="btn-secondary">Search</Button>
          </form>
          <p className="faint small" style={{ marginBottom: 14 }}>Ranked by how many of your missing required skills and empty roles each student would fill.</p>
          {candidates === null ? <PageLoading /> : candidates.length === 0 ? (
            <p className="faint">No students to suggest. Only students who turn on "Show me in teammate search" appear here. You can always invite a classmate by email above.</p>
          ) : (
            <div className="list">
              {candidates.map((c) => (
                <div key={c.id} className="list-item">
                  <Avatar name={c.fullName} url={c.avatarUrl} />
                  <div className="grow">
                    <div className="title">{c.fullName} <span className="faint small">· {c.recommendedRole}</span></div>
                    <div className="sub">{c.skills.slice(0, 6).map((s) => s.name).join(" · ")}</div>
                    {(c.fit.fillsSkills.length > 0 || c.fit.fillsRoles.length > 0) && (
                      <div className="chip-list" style={{ marginTop: 6 }}>
                        {c.fit.fillsSkills.map((s) => <span key={s} className="chip chip-mint">Has {s}</span>)}
                        {c.fit.fillsRoles.map((r) => <span key={r} className="chip">Fills {r}</span>)}
                      </div>
                    )}
                  </div>
                  <Button className="btn-primary btn-sm" disabled={seatsLeft <= 0} loading={inviting === c.id} onClick={() => invite(c)}>Invite</Button>
                </div>
              ))}
            </div>
          )}
          {data.pendingInvitations.length > 0 && (
            <>
              <div className="card-title-gold" style={{ margin: "22px 0 10px" }}>Pending invitations</div>
              <div className="list">
                {data.pendingInvitations.map((p) => (
                  <div key={p.id} className="list-item">
                    <div className="grow"><div className="title">{p.inviteeName}</div><div className="sub">Invited {timeAgo(p.createdAt)}</div></div>
                    <Button className="btn-ghost btn-xs" onClick={async () => { await api.del(`/teams/${team.id}/invitations/${p.id}`); toast("Invitation cancelled.", "info"); await reload(); await loadCandidates(); }}>Cancel</Button>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {editing && <TeamFormModal team={team} onClose={() => setEditing(false)} onSaved={async () => { setEditing(false); toast("Team updated.", "success"); await reload(); }} />}
      <ConfirmModal
        open={Boolean(confirm)}
        title={confirm === "delete" ? "Delete team?" : confirm === "leave" ? "Leave team?" : "Remove member?"}
        message={confirm === "delete" ? "All members will be notified and the team will be removed." : confirm === "leave" ? (isOwner ? "Ownership passes to the longest-standing member. If you're the last member, the team is deleted." : "You can rejoin only with a new invitation.") : `Remove ${typeof confirm === "object" && confirm ? confirm.name : ""} from ${team.name}?`}
        confirmLabel={confirm === "delete" ? "Delete" : confirm === "leave" ? "Leave" : "Remove"}
        danger
        onClose={() => setConfirm(null)}
        onConfirm={doConfirm}
      />
    </div>
  );
}

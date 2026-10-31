/**
 * CampusHub AI Assistant.
 *
 * The model only sees the logged-in student's OWN data (built below) and is
 * instructed not to invent anything. Without an AI provider, a clearly
 * labelled rule-based assistant answers the most common questions.
 */
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../../db/client.js";
import { teamMembers, teams, users } from "../../db/schema.js";
import { computeCareerMetrics, ruleBasedRecommendations, type CareerMetrics } from "../career.js";
import { analyseTeam, listToSentence } from "../engines.js";
import { getOpportunityMatches } from "../studentData.js";
import { loadTeam } from "../people.js";
import { AiProviderError, generateText, type ChatTurn } from "./provider.js";

export interface StudentContext {
  name: string;
  metrics: CareerMetrics;
  openMatches: { title: string; organization: string; percentage: number; matched: string[]; missing: string[]; deadline: string; applied: boolean }[];
  applications: { title: string; status: string }[];
  teams: { name: string; project: string; coverage: number; readiness: number; missingRoles: string[] }[];
}

export async function buildStudentContext(dbx: DbOrTx, userId: string): Promise<StudentContext> {
  const [[user], metrics, matches] = await Promise.all([
    dbx.select({ fullName: users.fullName }).from(users).where(eq(users.id, userId)),
    computeCareerMetrics(dbx, userId),
    getOpportunityMatches(dbx, userId),
  ]);

  const openMatches = matches
    .filter((m) => m.isOpen)
    .sort((a, b) => b.match.percentage - a.match.percentage)
    .slice(0, 8)
    .map((m) => ({
      title: m.title,
      organization: m.organization,
      percentage: m.match.percentage,
      matched: m.match.matched.map((s) => s.name),
      missing: m.match.missing.map((s) => s.name),
      deadline: m.deadline.toISOString().slice(0, 10),
      applied: Boolean(m.application),
    }));

  const applications = matches.filter((m) => m.application).map((m) => ({ title: m.title, status: m.application!.status }));

  // team summaries (lightweight: names + analysis numbers only)
  const memberships = await dbx.select({ teamId: teamMembers.teamId }).from(teamMembers).innerJoin(teams, eq(teams.id, teamMembers.teamId)).where(and(eq(teamMembers.userId, userId)));
  const teamSummaries: StudentContext["teams"] = [];
  for (const { teamId } of memberships) {
    const team = await loadTeam(dbx, teamId);
    if (team) {
      teamSummaries.push({
        name: team.name,
        project: team.projectTitle,
        coverage: team.analysis.coverage,
        readiness: team.analysis.readiness,
        missingRoles: team.analysis.missingRoles.map((r) => r.role),
      });
    }
  }

  return { name: user?.fullName ?? "Student", metrics, openMatches, applications, teams: teamSummaries };
}

/** Compact, factual description of the student's data for the model. */
export function contextToText(c: StudentContext): string {
  const m = c.metrics;
  const lines = [
    `Student name: ${c.name}`,
    `Profile completion: ${m.completion.percentage}% (missing: ${m.completion.sections.filter((s) => !s.done).map((s) => s.label).join(", ") || "nothing"})`,
    `Skills: ${m.skills.map((s) => `${s.name} ${s.proficiency}% (${s.level})`).join(", ") || "none listed"}`,
    `Projects (${m.portfolio.projects}): ${m.projectTitles.join(", ") || "none"}`,
    `Certifications: ${m.portfolio.certifications}; Achievements: ${m.portfolio.achievements}`,
    `Career readiness indicator: ${m.overall}/100 (${m.band}). Breakdown: ${m.parts.map((p) => `${p.label} ${p.score}`).join(", ")}`,
    `Open opportunities ranked by skill match (match % = matched required skills ÷ required skills × 100):`,
    ...c.openMatches.map(
      (o) => `- ${o.title} at ${o.organization}: ${o.percentage}% (has: ${o.matched.join(", ") || "none"}; missing: ${o.missing.join(", ") || "none"}; deadline ${o.deadline}${o.applied ? "; already applied" : ""})`,
    ),
    `Most requested missing skills: ${m.recommendedSkills.map((s) => `${s.name} (${s.count} opportunities)`).join(", ") || "none"}`,
    `Applications: ${c.applications.map((a) => `${a.title} → ${a.status}`).join("; ") || "none yet"}`,
    `Teams: ${c.teams.map((t) => `${t.name} (${t.project}): coverage ${t.coverage}%, readiness ${t.readiness}%, missing roles: ${t.missingRoles.join(", ") || "none"}`).join("; ") || "not in a team"}`,
  ];
  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are the CampusHub AI Assistant, a friendly career mentor for university computer-science students.
Use ONLY the student data provided below. Rules:
- Never invent skills, certifications, achievements, applications, opportunities or numbers that are not in the data.
- If the data does not contain the answer, say so plainly and suggest where in CampusHub the student can find or add it.
- Match percentages are calculated as matched required skills ÷ required skills × 100. Explain them that way.
- Give specific, actionable advice in short paragraphs or bullet points (under 180 words).
- You cannot submit applications, change data or browse the internet. Say so if asked.`;

/** Replies with the configured LLM, falling back to rules if AI is unavailable or fails. */
export async function answerQuestion(c: StudentContext, history: ChatTurn[], question: string) {
  try {
    const result = await generateText({
      system: `${SYSTEM_PROMPT}\n\n--- STUDENT DATA ---\n${contextToText(c)}`,
      messages: [...history.slice(-10), { role: "user", content: question }],
      maxTokens: 600,
    });
    return { text: result.text, provider: result.provider, degraded: false };
  } catch (error) {
    const reason = error instanceof AiProviderError ? error.message : "AI unavailable";
    return { text: fallbackAnswer(c, question), provider: "fallback", degraded: reason !== "No AI provider is configured." };
  }
}

/** Rule-based answers for the most common questions. Clearly labelled in the UI. */
export function fallbackAnswer(c: StudentContext, question: string): string {
  const q = question.toLowerCase();
  const m = c.metrics;
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("intern", "opportunit", "match", "apply", "hackathon", "job")) {
    if (has("why", "explain", "how is", "calculated", "percentage")) {
      const o = c.openMatches[0];
      return o
        ? `Match % = matched required skills ÷ required skills × 100. For example, ${o.title} needs ${[...o.matched, ...o.missing].join(", ")}. You have ${o.matched.join(", ") || "none of them"}, so ${o.matched.length} ÷ ${o.matched.length + o.missing.length} × 100 = ${o.percentage}%.`
        : "Match % = matched required skills ÷ required skills × 100. There are no open opportunities to explain right now.";
    }
    const best = c.openMatches.filter((o) => !o.applied && o.percentage > 0).slice(0, 3);
    if (!best.length) return "None of the open opportunities you haven't applied to match your current skills yet. Add more skills to your profile or check back for new postings.";
    return `Based on your skills, your strongest open matches are:\n${best
      .map((o) => `• ${o.title} (${o.organization}): ${o.percentage}% match${o.missing.length ? `, missing ${o.missing.join(", ")}` : ""}`)
      .join("\n")}\nOpen the Opportunities page to see details and apply.`;
  }
  if (has("learn", "next skill", "skill should", "improve skill", "missing skill")) {
    const top = m.recommendedSkills.slice(0, 3);
    return top.length
      ? `Based on the skills open opportunities ask for, good next skills are:\n${top.map((s) => `• ${s.name}: requested by ${s.count} opportunit${s.count === 1 ? "y" : "ies"} (${s.opportunities.slice(0, 2).join(", ")})`).join("\n")}`
      : "You already have every skill the current open opportunities ask for. Consider deepening your strongest skills or building a project.";
  }
  if (has("profile", "complete", "improve my")) {
    const missing = m.completion.sections.filter((s) => !s.done);
    return missing.length
      ? `Your profile is ${m.completion.percentage}% complete. To improve it:\n${missing.map((s) => `• ${s.tip} (+${s.points} points)`).join("\n")}`
      : "Your profile is 100% complete. Keep your skills and projects up to date.";
  }
  if (has("application", "status", "track", "shortlist", "interview")) {
    return c.applications.length
      ? `Your applications:\n${c.applications.map((a) => `• ${a.title}: ${a.status.charAt(0) + a.status.slice(1).toLowerCase()}`).join("\n")}\nStatus changes are made by administrators, and you'll get a notification for each one.`
      : "You haven't applied to any opportunities yet. Your best matches are on the Opportunities page.";
  }
  if (has("team", "group", "teammate", "role")) {
    if (!c.teams.length) return "You're not in a team yet. Go to Group Up to create one. CampusHub will suggest teammates whose skills fill your gaps.";
    return c.teams
      .map((t) => `${t.name}: ${t.coverage}% skill-area coverage, ${t.readiness}% readiness.${t.missingRoles.length ? ` Missing roles: ${listToSentence(t.missingRoles)}.` : " Every role is filled."}`)
      .join("\n");
  }
  if (has("project")) {
    const skill = m.strongSkills[0] ?? m.skills[0]?.name;
    const learn = m.recommendedSkills[0]?.name;
    return skill
      ? `Project idea: build something that shows off ${skill}${learn ? ` and lets you practise ${learn}` : ""}. For example, a small app with a database, a README and a live demo link. Add it to your profile when it's done.`
      : "Add a few skills to your profile first. I'll then suggest projects that build on them.";
  }
  if (has("career", "ready", "readiness", "progress", "score")) {
    return `Your career readiness indicator is ${m.overall}/100 (${m.band}). ${m.parts.map((p) => `${p.label}: ${p.score}`).join(", ")}.\n${ruleBasedRecommendations(m)[0]}`;
  }
  return "I'm the basic CampusHub assistant. I can help with:\n• which opportunities match your skills\n• which skill to learn next\n• how to improve your profile\n• your application status\n• your team's missing roles\n• how match percentages are calculated\nTry asking one of those!";
}

/** AI-written career recommendations (or rule-based ones), grounded in measured metrics. */
export async function generateCareerSummary(c: StudentContext) {
  const rules = ruleBasedRecommendations(c.metrics);
  try {
    const result = await generateText({
      system: `${SYSTEM_PROMPT}\nWrite 3 to 5 bullet-point recommendations (one sentence each) that would most improve this student's career readiness. Base every point on the data. Do not mention a readiness score you were not given. Start each bullet with "- ".`,
      messages: [{ role: "user", content: `--- STUDENT DATA ---\n${contextToText(c)}\n\nWhat should I focus on this week?` }],
      maxTokens: 500,
    });
    const bullets = result.text
      .split("\n")
      .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
      .filter((l) => l.length > 3)
      .slice(0, 5);
    return { recommendations: bullets.length ? bullets : rules, provider: result.provider };
  } catch {
    return { recommendations: rules, provider: "rules" };
  }
}


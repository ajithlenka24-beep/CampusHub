/**
 * Career progress tracker.
 *
 * MEASURED part (deterministic, shown with formulas):
 *   profile completion, skill strength, portfolio, applications, opportunity fit
 *   → a weighted "career readiness indicator". It is a progress indicator based
 *   on CampusHub data, NOT a prediction that someone will be hired.
 *
 * GENERATED part: written recommendations (AI when configured, otherwise rules).
 * The AI only receives the measured data and is told not to invent anything.
 */
import { and, desc, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { achievements, applications, careerGoals, careerProgress, certifications, projects } from "../db/schema.js";
import { listToSentence } from "./engines.js";
import { proficiencyLevel } from "./skillNormalizer.js";
import { getOpportunityMatches, getProfileCompletion, getStudentSkills, rankMissingSkills } from "./studentData.js";
import { weekStart } from "../utils/dates.js";

export interface ScorePart {
  key: "profile" | "skills" | "portfolio" | "opportunityFit" | "applications";
  label: string;
  score: number;
  weight: number;
  formula: string;
}

const clampScore = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export async function computeCareerMetrics(dbx: DbOrTx, userId: string) {
  const [completion, skillRows, projectRows, certRows, achievementRows, appRows, matches] = await Promise.all([
    getProfileCompletion(dbx, userId),
    getStudentSkills(dbx, userId),
    dbx.select({ id: projects.id, title: projects.title, description: projects.description }).from(projects).where(eq(projects.userId, userId)),
    dbx.select({ id: certifications.id }).from(certifications).where(eq(certifications.userId, userId)),
    dbx.select({ id: achievements.id }).from(achievements).where(eq(achievements.userId, userId)),
    dbx.select({ status: applications.status }).from(applications).where(eq(applications.userId, userId)),
    getOpportunityMatches(dbx, userId),
  ]);

  // Skill strength = average proficiency of the student's skills
  const avgProficiency = skillRows.length ? skillRows.reduce((s, r) => s + r.proficiency, 0) / skillRows.length : 0;

  // Portfolio = projects (60) + certifications (25) + achievements (15), each capped
  const portfolio = (Math.min(projectRows.length, 3) / 3) * 60 + (Math.min(certRows.length, 2) / 2) * 25 + (Math.min(achievementRows.length, 2) / 2) * 15;

  // Applications = activity (up to 5 active applications = 70) + progress past "Applied" (30)
  const active = appRows.filter((a) => a.status !== "WITHDRAWN");
  const progressed = active.some((a) => ["SHORTLISTED", "INTERVIEW", "SELECTED"].includes(a.status));
  const applicationScore = (Math.min(active.length, 5) / 5) * 70 + (progressed ? 30 : 0);

  // Opportunity fit = average match % of the 5 best open opportunities
  const open = matches.filter((m) => m.isOpen).sort((a, b) => b.match.percentage - a.match.percentage);
  const top = open.slice(0, 5);
  const fit = top.length ? top.reduce((s, m) => s + m.match.percentage, 0) / top.length : 0;

  const parts: ScorePart[] = [
    { key: "profile", label: "Profile completion", score: completion.percentage, weight: 0.25, formula: `${completion.earned} of ${completion.total} profile points` },
    { key: "skills", label: "Skill strength", score: clampScore(avgProficiency), weight: 0.25, formula: `average proficiency of ${skillRows.length} skill${skillRows.length === 1 ? "" : "s"}` },
    {
      key: "portfolio",
      label: "Portfolio",
      score: clampScore(portfolio),
      weight: 0.2,
      formula: `${projectRows.length} project(s) /3 × 60 + ${certRows.length} certification(s) /2 × 25 + ${achievementRows.length} achievement(s) /2 × 15 (each capped)`,
    },
    { key: "opportunityFit", label: "Opportunity fit", score: clampScore(fit), weight: 0.15, formula: `average match of your top ${top.length} open opportunit${top.length === 1 ? "y" : "ies"}` },
    {
      key: "applications",
      label: "Application progress",
      score: clampScore(applicationScore),
      weight: 0.15,
      formula: `${active.length} active application(s) /5 × 70${progressed ? " + 30 for reaching shortlist or beyond" : " (+30 once one is shortlisted)"}`,
    },
  ];
  const overall = clampScore(parts.reduce((s, p) => s + p.score * p.weight, 0));
  const band = overall >= 85 ? "Strong" : overall >= 65 ? "Progressing" : overall >= 40 ? "Developing" : "Foundation";

  const recommendedSkills = rankMissingSkills(matches, 6);
  const strongSkills = skillRows.filter((s) => s.proficiency >= 75).map((s) => s.name);
  const weakSkills = skillRows.filter((s) => s.proficiency < 50).map((s) => s.name);

  return {
    overall,
    band,
    disclaimer: "This indicator summarises your CampusHub data. It is not a prediction of hiring outcomes.",
    parts,
    formula: "Readiness = 25% profile + 25% skills + 20% portfolio + 15% opportunity fit + 15% applications",
    completion,
    skills: skillRows.map((s) => ({ name: s.name, proficiency: s.proficiency, level: proficiencyLevel(s.proficiency), experienceMonths: s.experienceMonths })),
    strongSkills,
    weakSkills,
    portfolio: { projects: projectRows.length, certifications: certRows.length, achievements: achievementRows.length },
    applications: {
      total: appRows.length,
      byStatus: appRows.reduce<Record<string, number>>((acc, a) => ({ ...acc, [a.status]: (acc[a.status] ?? 0) + 1 }), {}),
    },
    topMatches: top.map((m) => ({ id: m.id, title: m.title, organization: m.organization, percentage: m.match.percentage, missing: m.match.missing.map((s) => s.name), applied: Boolean(m.application) })),
    recommendedSkills,
    missingSkills: [...new Set(top.flatMap((m) => m.match.missing.map((s) => s.name)))],
    projectTitles: projectRows.map((p) => p.title),
  };
}

export type CareerMetrics = Awaited<ReturnType<typeof computeCareerMetrics>>;

/** Rule-based recommendations, used when no AI provider is configured (or it fails). */
export function ruleBasedRecommendations(m: CareerMetrics): string[] {
  const tips: string[] = [];
  const nextSkills = m.recommendedSkills.slice(0, 2).map((s) => s.name);
  if (m.strongSkills.length && nextSkills.length) {
    tips.push(`Your ${listToSentence(m.strongSkills.slice(0, 3))} skills are strong. Consider learning ${listToSentence(nextSkills)} to qualify for more of the open opportunities.`);
  } else if (nextSkills.length) {
    tips.push(`Learning ${listToSentence(nextSkills)} would raise your match for ${m.recommendedSkills[0].count} open opportunit${m.recommendedSkills[0].count === 1 ? "y" : "ies"}.`);
  }
  const missingSections = m.completion.sections.filter((s) => !s.done);
  if (missingSections.length) tips.push(`Complete your profile: ${missingSections.slice(0, 3).map((s) => s.tip.replace(/\.$/, "").toLowerCase()).join("; ")}.`);
  if (m.portfolio.projects < 2) tips.push("Add another project with a clear description. Projects carry the most weight in your portfolio score.");
  if (m.weakSkills.length) tips.push(`Practise ${listToSentence(m.weakSkills.slice(0, 2))} to move them past the beginner level.`);
  const applyTarget = m.topMatches.find((t) => !t.applied && t.percentage >= 60);
  if (applyTarget) tips.push(`You are a ${applyTarget.percentage}% match for ${applyTarget.title}. Consider applying before the deadline.`);
  if (!tips.length) tips.push("Great work. Keep your profile current and keep applying to opportunities that match your skills.");
  return tips.slice(0, 5);
}

/** Builds this week's goals from measurable gaps (never from invented activities). */
export async function ensureWeeklyGoals(dbx: DbOrTx, userId: string, m: CareerMetrics) {
  const week = weekStart();
  const existing = await dbx.select().from(careerGoals).where(and(eq(careerGoals.userId, userId), eq(careerGoals.weekStart, week)));
  if (existing.length) return existing;

  const goals: { title: string; detail: string; category: string }[] = [];
  const skill = m.recommendedSkills[0];
  if (skill) goals.push({ title: `Learn the basics of ${skill.name}`, detail: `Needed by ${skill.count} open opportunit${skill.count === 1 ? "y" : "ies"}: ${skill.opportunities.slice(0, 3).join(", ")}.`, category: "skill" });
  const section = m.completion.sections.find((s) => !s.done);
  if (section) goals.push({ title: section.tip.replace(/\.$/, ""), detail: `Worth ${section.points} profile-completion points.`, category: "profile" });
  const target = m.topMatches.find((t) => !t.applied && t.percentage >= 50);
  if (target) goals.push({ title: `Apply to ${target.title}`, detail: `You are a ${target.percentage}% match at ${target.organization}.`, category: "application" });
  if (m.portfolio.projects < 3) goals.push({ title: "Build or document a project", detail: "Add a project with a description, the technologies used and a GitHub link.", category: "portfolio" });
  const weak = m.skills.filter((s) => s.proficiency < 60).sort((a, b) => a.proficiency - b.proficiency)[0];
  if (weak) goals.push({ title: `Practise ${weak.name} for 3 hours`, detail: `Currently ${weak.level} (${weak.proficiency}%). Update your proficiency after practising.`, category: "skill" });

  if (!goals.length) return [];
  return dbx
    .insert(careerGoals)
    .values(goals.slice(0, 4).map((g) => ({ ...g, userId, weekStart: week })))
    .returning();
}

export async function latestSnapshots(dbx: DbOrTx, userId: string, limit = 12) {
  return dbx.select().from(careerProgress).where(eq(careerProgress.userId, userId)).orderBy(desc(careerProgress.createdAt)).limit(limit);
}

export async function saveSnapshot(dbx: DbOrTx, userId: string, m: CareerMetrics, aiSummary: string, aiProvider: string) {
  const score = (key: ScorePart["key"]) => m.parts.find((p) => p.key === key)?.score ?? 0;
  const [row] = await dbx
    .insert(careerProgress)
    .values({
      userId,
      overallScore: m.overall,
      profileScore: score("profile"),
      skillScore: score("skills"),
      portfolioScore: score("portfolio"),
      applicationScore: score("applications"),
      opportunityFitScore: score("opportunityFit"),
      aiSummary,
      aiProvider,
    })
    .returning();
  return row;
}

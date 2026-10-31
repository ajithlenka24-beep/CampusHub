/**
 * CampusHub's deterministic engines. Pure functions only (no database), so
 * every number shown in the UI can be reproduced by hand during a viva.
 *
 *  1. Skill match        = matched required skills ÷ required skills × 100
 *  2. Profile completion = points earned ÷ 100 (each section has fixed points)
 *  3. Team analysis      = skill-area coverage, role coverage and readiness
 */
import { AREA_NAMES, TEAM_AREAS, detectSkillAreas, normalizeSkill, recommendRoleArea, roleLabel } from "./skillNormalizer.js";

/* ================================================================ 1. skill match */
export interface SkillRef {
  id: number;
  name: string;
}

export interface MatchResult {
  percentage: number;
  matched: SkillRef[];
  missing: SkillRef[];
  requiredCount: number;
}

/**
 * Compares the student's skills with an opportunity's required skills.
 * Skills are compared by canonical name, so "JS" matches "JavaScript".
 */
export function calculateMatch(studentSkills: SkillRef[], requiredSkills: SkillRef[]): MatchResult {
  const owned = new Set(studentSkills.map((s) => normalizeSkill(s.name)));
  const matched: SkillRef[] = [];
  const missing: SkillRef[] = [];
  for (const skill of requiredSkills) {
    (owned.has(normalizeSkill(skill.name)) ? matched : missing).push(skill);
  }
  const percentage = requiredSkills.length ? Math.round((matched.length / requiredSkills.length) * 100) : 100;
  return { percentage, matched, missing, requiredCount: requiredSkills.length };
}

/* ================================================================ 2. profile completion */
export interface CompletionInput {
  fullName: string;
  college: string;
  course: string;
  semester: number | null;
  bio: string;
  avatarUrl: string | null;
  skillCount: number;
  projectCount: number;
  achievementCount: number;
  certificationCount: number;
  githubUrl: string | null;
  linkedinUrl: string | null;
}

export interface CompletionSection {
  key: string;
  label: string;
  points: number;
  done: boolean;
  tip: string;
}

export interface CompletionResult {
  percentage: number;
  earned: number;
  total: number;
  sections: CompletionSection[];
}

const filled = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

/** Each section is worth fixed points (total 100). Completion % = points earned. */
export function calculateProfileCompletion(p: CompletionInput): CompletionResult {
  const sections: CompletionSection[] = [
    { key: "basics", label: "Name, college & course", points: 10, done: filled(p.fullName) && filled(p.college) && filled(p.course), tip: "Add your college and course." },
    { key: "semester", label: "Semester", points: 5, done: (p.semester ?? 0) >= 1, tip: "Add your current semester." },
    { key: "bio", label: "Short introduction", points: 10, done: (p.bio ?? "").trim().length >= 30, tip: "Write a short introduction (at least 30 characters)." },
    { key: "avatar", label: "Profile picture", points: 5, done: filled(p.avatarUrl), tip: "Upload a profile picture." },
    { key: "skills", label: "At least 3 skills", points: 20, done: p.skillCount >= 3, tip: "Add at least 3 technical skills." },
    { key: "projects", label: "At least 1 project", points: 20, done: p.projectCount >= 1, tip: "Add a project with a description." },
    { key: "achievements", label: "Achievements", points: 5, done: p.achievementCount >= 1, tip: "Add an achievement." },
    { key: "certifications", label: "Certifications", points: 5, done: p.certificationCount >= 1, tip: "Add a certification." },
    { key: "github", label: "GitHub link", points: 10, done: filled(p.githubUrl), tip: "Add your GitHub profile link." },
    { key: "linkedin", label: "LinkedIn link", points: 10, done: filled(p.linkedinUrl), tip: "Add your LinkedIn profile link." },
  ];
  const total = sections.reduce((sum, s) => sum + s.points, 0);
  const earned = sections.reduce((sum, s) => sum + (s.done ? s.points : 0), 0);
  return { percentage: Math.round((earned / total) * 100), earned, total, sections };
}

/* ================================================================ 3. team analysis */
export interface TeamMemberInput {
  userId: string;
  name: string;
  skills: string[];
  roleArea: string; // "" = auto-detect from skills
}

export interface AnalysedMember extends TeamMemberInput {
  recommendedArea: string | null;
  effectiveArea: string | null;
  roleLabel: string;
  isAutoRole: boolean;
}

export interface TeamAnalysis {
  members: AnalysedMember[];
  areaCoverage: { area: string; role: string; covered: boolean; skills: string[]; owners: string[] }[];
  coverage: number; // % of the 7 skill areas covered by at least one member skill
  requiredSkillCoverage: { percentage: number; matched: string[]; missing: string[] } | null;
  missingRoles: { area: string; role: string; critical: boolean; examples: string }[];
  readiness: number;
  readinessLabel: string;
  readinessParts: { label: string; weight: number; score: number }[];
  summary: string;
  recommendations: string[];
}

export const IDEAL_TEAM_SIZE = 5;

/**
 * Skill coverage = covered skill areas ÷ 7 × 100
 * Readiness      = 40% skill coverage + 20% team size + 20% role diversity + 20% critical roles
 *                  (when the team lists required skills, "skill coverage" uses those instead)
 */
export function analyseTeam(input: { members: TeamMemberInput[]; requiredSkills?: string[] }): TeamAnalysis {
  const members: AnalysedMember[] = input.members.map((m) => {
    const recommendedArea = recommendRoleArea(m.skills);
    const effectiveArea = AREA_NAMES.includes(m.roleArea) ? m.roleArea : recommendedArea;
    return { ...m, recommendedArea, effectiveArea, roleLabel: roleLabel(effectiveArea), isAutoRole: !AREA_NAMES.includes(m.roleArea) };
  });

  const areaSkills = new Map<string, Map<string, string>>(AREA_NAMES.map((a) => [a, new Map()]));
  for (const member of members) {
    for (const skill of member.skills) {
      for (const area of detectSkillAreas(skill)) {
        const bucket = areaSkills.get(area)!;
        if (!bucket.has(normalizeSkill(skill))) bucket.set(normalizeSkill(skill), skill);
      }
    }
  }

  const areaCoverage = TEAM_AREAS.map(({ area, role }) => ({
    area,
    role,
    covered: areaSkills.get(area)!.size > 0,
    skills: [...areaSkills.get(area)!.values()],
    owners: members.filter((m) => m.effectiveArea === area).map((m) => m.name),
  }));
  const coveredCount = areaCoverage.filter((a) => a.covered).length;
  const areaCoverageExact = (coveredCount / TEAM_AREAS.length) * 100;

  let requiredSkillCoverage: TeamAnalysis["requiredSkillCoverage"] = null;
  if (input.requiredSkills?.length) {
    const owned = new Set(members.flatMap((m) => m.skills.map(normalizeSkill)));
    const matched = input.requiredSkills.filter((s) => owned.has(normalizeSkill(s)));
    const missing = input.requiredSkills.filter((s) => !owned.has(normalizeSkill(s)));
    requiredSkillCoverage = { percentage: Math.round((matched.length / input.requiredSkills.length) * 100), matched, missing };
  }

  const filledRoles = new Set(members.map((m) => m.effectiveArea).filter((a): a is string => Boolean(a)));
  const missingRoles = TEAM_AREAS.filter((a) => !filledRoles.has(a.area)).map(({ area, role, critical, examples }) => ({ area, role, critical, examples }));
  const criticalAreas = TEAM_AREAS.filter((a) => a.critical);
  const missingCritical = missingRoles.filter((r) => r.critical);

  const skillScore = requiredSkillCoverage ? requiredSkillCoverage.percentage : areaCoverageExact;
  const sizeScore = Math.min(members.length / IDEAL_TEAM_SIZE, 1) * 100;
  const diversityScore = members.length ? (filledRoles.size / Math.min(members.length, TEAM_AREAS.length)) * 100 : 0;
  const criticalScore = ((criticalAreas.length - missingCritical.length) / criticalAreas.length) * 100;
  const readinessParts = [
    { label: requiredSkillCoverage ? "required-skill coverage" : "skill-area coverage", weight: 0.4, score: round1(skillScore) },
    { label: "team size", weight: 0.2, score: round1(sizeScore) },
    { label: "role diversity", weight: 0.2, score: round1(diversityScore) },
    { label: "critical roles", weight: 0.2, score: round1(criticalScore) },
  ];
  const readiness = members.length ? Math.round(readinessParts.reduce((sum, p) => sum + p.weight * p.score, 0)) : 0;
  const readinessLabel =
    readiness >= 85 && !missingCritical.length ? "Hackathon Ready" : readiness >= 65 ? "Almost Ready" : readiness >= 40 ? "Needs Work" : "Just Getting Started";

  const recommendations: string[] = [];
  if (members.length < 3) recommendations.push(`Add more members. Strong project teams usually have 4 to 6 people (you have ${members.length}).`);
  if (missingCritical.length) recommendations.push(`Critical gap: nobody owns the ${listToSentence(missingCritical.map((r) => r.role))} role.`);
  for (const area of areaCoverage.filter((a) => !a.covered).slice(0, 3)) {
    const meta = TEAM_AREAS.find((t) => t.area === area.area)!;
    recommendations.push(`No ${area.area} skills yet. Invite a teammate who knows ${meta.examples}.`);
  }
  if (requiredSkillCoverage?.missing.length) {
    recommendations.push(`Your project needs ${listToSentence(requiredSkillCoverage.missing)}, which nobody in the team has yet.`);
  }
  const roleCounts = new Map<string, number>();
  members.forEach((m) => m.effectiveArea && roleCounts.set(m.effectiveArea, (roleCounts.get(m.effectiveArea) ?? 0) + 1));
  for (const [area, count] of roleCounts) {
    if (count >= 3 && missingRoles.length) recommendations.push(`${count} members share the ${area} role. Moving one to ${missingRoles[0].area} would balance the team.`);
  }
  if (!recommendations.length && members.length) recommendations.push("Every key area has both skills and an owner. Your team is ready to build!");

  let summary = "Add members to see how prepared your team is.";
  if (members.length >= 1 && members.length < 3) summary = "Your team is just getting started. Add more members to build a balanced team.";
  else if (members.length >= 3 && !missingRoles.length) summary = "Your team is well balanced: every key role has a dedicated owner.";
  else if (members.length >= 3) {
    const strongDev = ["Frontend", "Backend", "Database"].every((a) => areaCoverage.find((c) => c.area === a)?.covered);
    const roles = missingRoles.map((r) => r.area);
    summary = `${strongDev ? "Your team has strong development coverage" : `Your team covers ${coveredCount} of ${TEAM_AREAS.length} skill areas`} but is missing ${
      roles.length === 1 ? `a dedicated ${roles[0]} role` : `dedicated ${listToSentence(roles)} roles`
    }.`;
  }

  return {
    members,
    areaCoverage,
    coverage: Math.round(areaCoverageExact),
    requiredSkillCoverage,
    missingRoles,
    readiness,
    readinessLabel,
    readinessParts,
    summary,
    recommendations,
  };
}

/**
 * How well a candidate would complement a team: how many of the team's
 * missing required skills and empty role areas the candidate covers.
 */
export function candidateFit(analysis: TeamAnalysis, candidateSkills: string[], requiredSkills: string[]) {
  const owned = new Set(candidateSkills.map(normalizeSkill));
  const missingRequired = analysis.requiredSkillCoverage?.missing ?? requiredSkills;
  const fillsSkills = missingRequired.filter((s) => owned.has(normalizeSkill(s)));
  const candidateAreas = new Set(candidateSkills.flatMap(detectSkillAreas));
  const fillsRoles = analysis.missingRoles.filter((r) => candidateAreas.has(r.area)).map((r) => r.area);
  const recommendedArea = recommendRoleArea(candidateSkills);
  return { fillsSkills, fillsRoles, recommendedRole: roleLabel(recommendedArea), score: fillsSkills.length * 2 + fillsRoles.length };
}

/* ================================================================ helpers */
export function listToSentence(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

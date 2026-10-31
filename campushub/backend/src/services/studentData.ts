/**
 * Read helpers that gather a student's own data. Used by the dashboard,
 * profile completion, opportunity matching, the career tracker and the AI
 * assistant, so every feature reads the same numbers from the database.
 */
import { and, asc, count, eq, gt, inArray, type SQL } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import {
  achievements,
  applications,
  certifications,
  opportunities,
  opportunitySkills,
  projects,
  skills,
  studentProfiles,
  studentSkills,
  users,
} from "../db/schema.js";
import { calculateMatch, calculateProfileCompletion, type MatchResult, type SkillRef } from "./engines.js";

export async function getStudentSkills(dbx: DbOrTx, userId: string) {
  return dbx
    .select({
      id: studentSkills.id,
      skillId: skills.id,
      name: skills.name,
      category: skills.category,
      proficiency: studentSkills.proficiency,
      experienceMonths: studentSkills.experienceMonths,
    })
    .from(studentSkills)
    .innerJoin(skills, eq(studentSkills.skillId, skills.id))
    .where(eq(studentSkills.userId, userId))
    .orderBy(asc(skills.name));
}

export async function getProfileCompletion(dbx: DbOrTx, userId: string) {
  const [row] = await dbx
    .select({
      fullName: users.fullName,
      college: studentProfiles.college,
      course: studentProfiles.course,
      semester: studentProfiles.semester,
      bio: studentProfiles.bio,
      avatarUrl: studentProfiles.avatarUrl,
      githubUrl: studentProfiles.githubUrl,
      linkedinUrl: studentProfiles.linkedinUrl,
    })
    .from(users)
    .leftJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(eq(users.id, userId));

  const counts = await getPortfolioCounts(dbx, userId);
  return calculateProfileCompletion({
    fullName: row?.fullName ?? "",
    college: row?.college ?? "",
    course: row?.course ?? "",
    semester: row?.semester ?? null,
    bio: row?.bio ?? "",
    avatarUrl: row?.avatarUrl ?? null,
    githubUrl: row?.githubUrl ?? null,
    linkedinUrl: row?.linkedinUrl ?? null,
    skillCount: counts.skills,
    projectCount: counts.projects,
    achievementCount: counts.achievements,
    certificationCount: counts.certifications,
  });
}

export async function getPortfolioCounts(dbx: DbOrTx, userId: string) {
  const one = async (table: typeof studentSkills | typeof projects | typeof achievements | typeof certifications | typeof applications) => {
    const [r] = await dbx.select({ n: count() }).from(table).where(eq(table.userId, userId));
    return Number(r?.n ?? 0);
  };
  const [skillsN, projectsN, achievementsN, certificationsN, applicationsN] = await Promise.all([
    one(studentSkills),
    one(projects),
    one(achievements),
    one(certifications),
    one(applications),
  ]);
  return { skills: skillsN, projects: projectsN, achievements: achievementsN, certifications: certificationsN, applications: applicationsN };
}

/* ---------------------------------------------------------------- opportunities */
export type OpportunityRow = typeof opportunities.$inferSelect;
export interface OpportunityWithSkills extends OpportunityRow {
  requiredSkills: SkillRef[];
}

/** Loads opportunities (optionally filtered) together with their required skills. */
export async function loadOpportunities(dbx: DbOrTx, where?: SQL): Promise<OpportunityWithSkills[]> {
  const rows = await dbx.select().from(opportunities).where(where).orderBy(asc(opportunities.deadline));
  if (!rows.length) return [];
  const links = await dbx
    .select({ opportunityId: opportunitySkills.opportunityId, id: skills.id, name: skills.name })
    .from(opportunitySkills)
    .innerJoin(skills, eq(opportunitySkills.skillId, skills.id))
    .where(inArray(opportunitySkills.opportunityId, rows.map((r) => r.id)))
    .orderBy(asc(skills.name));
  const byOpp = new Map<string, SkillRef[]>();
  for (const l of links) byOpp.set(l.opportunityId, [...(byOpp.get(l.opportunityId) ?? []), { id: l.id, name: l.name }]);
  return rows.map((r) => ({ ...r, requiredSkills: byOpp.get(r.id) ?? [] }));
}

export interface OpportunityMatch extends OpportunityWithSkills {
  match: MatchResult;
  isOpen: boolean;
  application: { id: string; status: string } | null;
}

/** Published opportunities with this student's match % and application state. */
export async function getOpportunityMatches(dbx: DbOrTx, userId: string, opts: { onlyOpen?: boolean } = {}): Promise<OpportunityMatch[]> {
  const now = new Date();
  const filters = [eq(opportunities.isPublished, true)];
  if (opts.onlyOpen) filters.push(gt(opportunities.deadline, now));
  const [opps, mySkills, myApps] = await Promise.all([
    loadOpportunities(dbx, and(...filters)),
    getStudentSkills(dbx, userId),
    dbx.select({ id: applications.id, opportunityId: applications.opportunityId, status: applications.status }).from(applications).where(eq(applications.userId, userId)),
  ]);
  const skillRefs = mySkills.map((s) => ({ id: s.skillId, name: s.name }));
  const appsByOpp = new Map(myApps.map((a) => [a.opportunityId, { id: a.id, status: a.status }]));
  return opps.map((o) => ({
    ...o,
    match: calculateMatch(skillRefs, o.requiredSkills),
    isOpen: o.deadline > now,
    application: appsByOpp.get(o.id) ?? null,
  }));
}

/**
 * Skills worth learning next: required skills the student lacks, ranked by how
 * many open opportunities ask for them (a transparent, data-based ranking).
 */
export function rankMissingSkills(matches: OpportunityMatch[], limit = 6) {
  const tally = new Map<string, { name: string; count: number; opportunities: string[] }>();
  for (const m of matches.filter((x) => x.isOpen)) {
    for (const skill of m.match.missing) {
      const entry = tally.get(skill.name) ?? { name: skill.name, count: 0, opportunities: [] };
      entry.count += 1;
      entry.opportunities.push(m.title);
      tally.set(skill.name, entry);
    }
  }
  return [...tally.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, limit);
}

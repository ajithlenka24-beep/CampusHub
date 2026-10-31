/**
 * Shared read models for people and teams (used by routes and the AI assistant).
 */
import { and, asc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import { db, type DbOrTx } from "../db/client.js";
import { skills, studentProfiles, studentSkills, teamMembers, teamRequiredSkills, teams, users } from "../db/schema.js";
import { analyseTeam } from "./engines.js";
import { normalizeSkill, proficiencyLevel, recommendRoleArea, roleLabel } from "./skillNormalizer.js";

/**
 * Public student cards for finding teammates. Only professional details are
 * shared (no email, applications, notifications or career data).
 */
export async function loadStudentCards(filter: { excludeUserId?: string; q?: string; skill?: string; ids?: string[]; limit?: number }) {
  const conditions = [eq(users.role, "STUDENT"), eq(users.isActive, true), eq(users.onboardingCompleted, true)];
  if (filter.excludeUserId) conditions.push(ne(users.id, filter.excludeUserId));
  if (filter.ids) conditions.push(filter.ids.length ? inArray(users.id, filter.ids) : eq(users.id, "00000000-0000-0000-0000-000000000000"));
  if (filter.q) {
    const term = `%${filter.q.replace(/[%_]/g, "")}%`;
    conditions.push(or(ilike(users.fullName, term), ilike(studentProfiles.college, term), ilike(studentProfiles.course, term))!);
  }

  const people = await db
    .select({
      id: users.id,
      fullName: users.fullName,
      college: studentProfiles.college,
      course: studentProfiles.course,
      semester: studentProfiles.semester,
      avatarUrl: studentProfiles.avatarUrl,
    })
    .from(users)
    .innerJoin(studentProfiles, eq(studentProfiles.userId, users.id))
    .where(and(...conditions))
    .orderBy(asc(users.fullName))
    .limit(filter.limit ?? 200);

  if (!people.length) return [];
  const skillRows = await db
    .select({ userId: studentSkills.userId, name: skills.name, proficiency: studentSkills.proficiency })
    .from(studentSkills)
    .innerJoin(skills, eq(studentSkills.skillId, skills.id))
    .where(inArray(studentSkills.userId, people.map((p) => p.id)));

  let cards = people.map((p) => {
    const mine = skillRows.filter((s) => s.userId === p.id).sort((a, b) => b.proficiency - a.proficiency);
    return {
      ...p,
      skills: mine.map(({ name, proficiency }) => ({ name, proficiency, level: proficiencyLevel(proficiency) })),
      recommendedRole: roleLabel(recommendRoleArea(mine.map((s) => s.name))),
    };
  });
  if (filter.skill) {
    const wanted = normalizeSkill(filter.skill);
    cards = cards.filter((c) => c.skills.some((s) => normalizeSkill(s.name) === wanted));
  }
  return cards;
}

/** Loads a team with members (and their skills), required skills and the compatibility analysis. */
export async function loadTeam(dbx: DbOrTx, teamId: string) {
  const [team] = await dbx.select().from(teams).where(eq(teams.id, teamId));
  if (!team) return null;

  const [memberRows, required] = await Promise.all([
    dbx
      .select({ userId: teamMembers.userId, roleArea: teamMembers.roleArea, joinedAt: teamMembers.joinedAt })
      .from(teamMembers)
      .where(eq(teamMembers.teamId, teamId))
      .orderBy(asc(teamMembers.joinedAt)),
    dbx
      .select({ id: skills.id, name: skills.name })
      .from(teamRequiredSkills)
      .innerJoin(skills, eq(teamRequiredSkills.skillId, skills.id))
      .where(eq(teamRequiredSkills.teamId, teamId))
      .orderBy(asc(skills.name)),
  ]);

  const ids = memberRows.map((m) => m.userId);
  const cards = ids.length ? await loadStudentCards({ ids, limit: 50 }) : [];
  const members = memberRows.map((m) => {
    const card = cards.find((c) => c.id === m.userId);
    return {
      userId: m.userId,
      fullName: card?.fullName ?? "Former student",
      avatarUrl: card?.avatarUrl ?? null,
      course: card?.course ?? "",
      skills: card?.skills ?? [],
      roleArea: m.roleArea,
      joinedAt: m.joinedAt,
      isOwner: m.userId === team.ownerId,
    };
  });

  const analysis = analyseTeam({
    members: members.map((m) => ({ userId: m.userId, name: m.fullName, skills: m.skills.map((s) => s.name), roleArea: m.roleArea })),
    requiredSkills: required.map((r) => r.name),
  });

  return {
    ...team,
    requiredSkills: required,
    members: members.map((m) => {
      const a = analysis.members.find((x) => x.userId === m.userId);
      return { ...m, roleLabel: a?.roleLabel ?? "Generalist", recommendedRole: a?.recommendedArea ?? null, isAutoRole: a?.isAutoRole ?? true };
    }),
    analysis,
  };
}



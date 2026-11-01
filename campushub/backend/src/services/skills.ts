import { and, asc, ilike, inArray, or, sql } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { opportunitySkills, skills, studentSkills, teamMembers, teamRequiredSkills } from "../db/schema.js";
import { badRequest } from "../utils/httpError.js";
import { displaySkillName, guessCategory, normalizeSkill } from "./skillNormalizer.js";
import type { SkillRef } from "./engines.js";

/**
 * Turns free-text skill names into catalogue rows (creating missing ones).
 * "js", "JS" and "JavaScript" all resolve to the single "JavaScript" skill.
 */
export async function getOrCreateSkills(dbx: DbOrTx, names: string[]): Promise<SkillRef[]> {
  const wanted = new Map<string, string>();
  for (const raw of names) {
    const name = String(raw ?? "").trim();
    if (!name) continue;
    if (name.length > 60) throw badRequest(`Skill name "${name.slice(0, 20)}…" is too long (max 60 characters).`);
    const normalized = normalizeSkill(name);
    if (!wanted.has(normalized)) wanted.set(normalized, displaySkillName(name));
  }
  if (!wanted.size) return [];

  await dbx
    .insert(skills)
    .values([...wanted].map(([normalizedName, name]) => ({ name, normalizedName, category: guessCategory(name) })))
    .onConflictDoNothing({ target: skills.normalizedName });

  const rows = await dbx
    .select({ id: skills.id, name: skills.name, normalizedName: skills.normalizedName })
    .from(skills)
    .where(inArray(skills.normalizedName, [...wanted.keys()]));

  // keep the caller's order
  const byKey = new Map(rows.map((r) => [r.normalizedName, { id: r.id, name: r.name }]));
  return [...wanted.keys()].map((key) => byKey.get(key)!).filter(Boolean);
}

/**
 * Autocomplete suggestions. Skill names are free text typed by students, so a name only one
 * other person ever typed is not suggested (it could reveal something about them). A skill is
 * suggested when an opportunity or one of the viewer's teams requires it, when the viewer has
 * it, or when at least two students list it.
 */
export async function searchSkillCatalog(dbx: DbOrTx, query: string, limit = 20, viewerId?: string) {
  const q = query.trim();
  const shared = or(
    sql`exists (select 1 from ${opportunitySkills} where ${opportunitySkills.skillId} = ${skills.id})`,
    sql`(select count(*) from ${studentSkills} where ${studentSkills.skillId} = ${skills.id}) >= 2`,
    viewerId ? sql`exists (select 1 from ${studentSkills} where ${studentSkills.skillId} = ${skills.id} and ${studentSkills.userId} = ${viewerId})` : undefined,
    viewerId
      ? sql`exists (select 1 from ${teamRequiredSkills} join ${teamMembers} on ${teamMembers.teamId} = ${teamRequiredSkills.teamId}
               where ${teamRequiredSkills.skillId} = ${skills.id} and ${teamMembers.userId} = ${viewerId})`
      : undefined,
  );
  return dbx
    .select({ id: skills.id, name: skills.name, category: skills.category })
    .from(skills)
    .where(and(q ? ilike(skills.name, `%${q.replace(/[%_\\]/g, "")}%`) : undefined, shared))
    .orderBy(asc(skills.name))
    .limit(limit);
}

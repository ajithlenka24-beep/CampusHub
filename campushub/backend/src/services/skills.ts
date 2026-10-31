import { asc, ilike, inArray } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { skills } from "../db/schema.js";
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

export async function searchSkillCatalog(dbx: DbOrTx, query: string, limit = 20) {
  const q = query.trim();
  return dbx
    .select({ id: skills.id, name: skills.name, category: skills.category })
    .from(skills)
    .where(q ? ilike(skills.name, `%${q.replace(/[%_]/g, "")}%`) : undefined)
    .orderBy(asc(skills.name))
    .limit(limit);
}

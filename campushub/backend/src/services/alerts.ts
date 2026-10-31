/**
 * Automatic notifications: new strong skill matches and approaching deadlines.
 * Each uses a dedupe key so a student never gets the same alert twice.
 */
import { and, eq } from "drizzle-orm";
import type { DbOrTx } from "../db/client.js";
import { opportunities, skills, studentSkills, users } from "../db/schema.js";
import { calculateMatch } from "./engines.js";
import { notify } from "./notifications.js";
import { getOpportunityMatches, loadOpportunities } from "./studentData.js";
import { addDays, daysUntil } from "../utils/dates.js";

export const STRONG_MATCH = 75;

/** Current match % for every open opportunity (used to compare before/after a skill change). */
export async function snapshotMatches(dbx: DbOrTx, userId: string) {
  const matches = await getOpportunityMatches(dbx, userId, { onlyOpen: true });
  return new Map(matches.map((m) => [m.id, m.match.percentage]));
}

/** After a student's skills change: alert about opportunities that just became strong matches. */
export async function notifyNewStrongMatches(dbx: DbOrTx, userId: string, before: Map<string, number>) {
  const matches = await getOpportunityMatches(dbx, userId, { onlyOpen: true });
  for (const m of matches) {
    const previous = before.get(m.id) ?? 0;
    if (!m.application && m.match.percentage >= STRONG_MATCH && previous < STRONG_MATCH) {
      await notify(dbx, userId, {
        type: "OPPORTUNITY_MATCH",
        title: "New opportunity matches your skills",
        message: `${m.title} at ${m.organization} is now a ${m.match.percentage}% match for your skills.`,
        link: `/opportunities/${m.id}`,
        dedupeKey: `match:${m.id}`,
      });
    }
  }
}

/** When an admin publishes or updates an opportunity: alert every student who is a strong match. */
export async function notifyMatchingStudents(dbx: DbOrTx, opportunityId: string) {
  const [opp] = await loadOpportunities(dbx, eq(opportunities.id, opportunityId));
  if (!opp || !opp.isPublished || opp.deadline <= new Date() || !opp.requiredSkills.length) return 0;

  const rows = await dbx
    .select({ userId: studentSkills.userId, id: skills.id, name: skills.name })
    .from(studentSkills)
    .innerJoin(skills, eq(studentSkills.skillId, skills.id))
    .innerJoin(users, eq(users.id, studentSkills.userId))
    .where(and(eq(users.role, "STUDENT"), eq(users.isActive, true), eq(users.onboardingCompleted, true)));

  const byUser = new Map<string, { id: number; name: string }[]>();
  for (const r of rows) byUser.set(r.userId, [...(byUser.get(r.userId) ?? []), { id: r.id, name: r.name }]);

  let notified = 0;
  for (const [userId, owned] of byUser) {
    const { percentage } = calculateMatch(owned, opp.requiredSkills);
    if (percentage >= STRONG_MATCH) {
      await notify(dbx, userId, {
        type: "OPPORTUNITY_MATCH",
        title: "New opportunity matches your skills",
        message: `${opp.title} at ${opp.organization} is a ${percentage}% match for your skills.`,
        link: `/opportunities/${opp.id}`,
        dedupeKey: `match:${opp.id}`,
      });
      notified += 1;
    }
  }
  return notified;
}

/** Reminds a student about good-fit opportunities closing within 3 days that they have not applied to. */
export async function ensureDeadlineReminders(dbx: DbOrTx, userId: string) {
  const now = new Date();
  const soon = await getOpportunityMatches(dbx, userId, { onlyOpen: true });
  for (const m of soon) {
    if (m.application || m.match.percentage < 50) continue;
    if (!(m.deadline > now && m.deadline < addDays(now, 3))) continue;
    const days = Math.max(daysUntil(m.deadline, now), 0);
    await notify(dbx, userId, {
      type: "DEADLINE",
      title: "Deadline approaching",
      message: `${m.title} closes ${days <= 1 ? "within a day" : `in ${days} days`} and is a ${m.match.percentage}% match. Apply before it closes.`,
      link: `/opportunities/${m.id}`,
      dedupeKey: `deadline:${m.id}`,
    });
  }
}

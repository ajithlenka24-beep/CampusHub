import type { DbOrTx } from "../db/client.js";
import { notifications } from "../db/schema.js";

export type NotificationType =
  | "APPLICATION_SUBMITTED"
  | "APPLICATION_STATUS"
  | "OPPORTUNITY_MATCH"
  | "DEADLINE"
  | "TEAM_INVITE"
  | "TEAM_UPDATE"
  | "PROFILE"
  | "SYSTEM";

export interface NewNotification {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  /** If set, the same notification is never created twice for this user. */
  dedupeKey?: string;
}

/** Stores a notification. Duplicates with the same dedupeKey are silently ignored. */
export async function notify(dbx: DbOrTx, userId: string, n: NewNotification) {
  await dbx
    .insert(notifications)
    .values({ userId, type: n.type, title: n.title, message: n.message, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })
    .onConflictDoNothing();
}

export async function notifyMany(dbx: DbOrTx, userIds: string[], n: NewNotification) {
  if (!userIds.length) return;
  await dbx
    .insert(notifications)
    .values(userIds.map((userId) => ({ userId, type: n.type, title: n.title, message: n.message, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })))
    .onConflictDoNothing();
}

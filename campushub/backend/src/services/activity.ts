import type { DbOrTx } from "../db/client.js";
import { activityLogs } from "../db/schema.js";

/** Records platform activity for the admin dashboard. Never pass secrets in `details`. */
export async function logActivity(
  dbx: DbOrTx,
  entry: { actorId: string | null; action: string; entityType?: string; entityId?: string; details?: Record<string, unknown>; isAdminAction?: boolean },
) {
  try {
    await dbx.insert(activityLogs).values({
      actorId: entry.actorId,
      action: entry.action,
      entityType: entry.entityType ?? "",
      entityId: entry.entityId ?? "",
      details: entry.details ?? {},
      isAdminAction: entry.isAdminAction ?? false,
    });
  } catch (error) {
    // logging must never break the user's request
    console.error("[CampusHub] Could not write activity log:", (error as Error).message);
  }
}

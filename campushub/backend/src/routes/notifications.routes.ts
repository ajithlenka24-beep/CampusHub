import { Router } from "express";
import { and, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { notifications } from "../db/schema.js";
import { currentUser, requireAuth } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { ensureDeadlineReminders } from "../services/alerts.js";
import { notFound } from "../utils/httpError.js";
import { uuidParam } from "../validators/common.js";

export async function unreadCount(userId: string) {
  const [row] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return Number(row?.n ?? 0);
}

export function notificationsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (req, res) => {
    const me = currentUser(req);
    const { limit } = parse(z.object({ limit: z.coerce.number().int().min(1).max(100).optional().default(30) }), req.query);
    if (me.role === "STUDENT" && me.onboardingCompleted) await ensureDeadlineReminders(db, me.id);
    const rows = await db.select().from(notifications).where(eq(notifications.userId, me.id)).orderBy(desc(notifications.createdAt)).limit(limit);
    res.json({
      notifications: rows.map(({ dedupeKey: _d, userId: _u, ...n }) => ({ ...n, read: Boolean(n.readAt) })),
      unreadCount: await unreadCount(me.id),
    });
  });

  router.post("/read-all", async (req, res) => {
    const me = currentUser(req);
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, me.id), isNull(notifications.readAt)));
    res.json({ unreadCount: 0 });
  });

  router.post("/:id/read", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.id, id), eq(notifications.userId, me.id)))
      .returning({ id: notifications.id });
    if (!updated.length) throw notFound("Notification not found.");
    res.json({ unreadCount: await unreadCount(me.id) });
  });

  router.delete("/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const deleted = await db.delete(notifications).where(and(eq(notifications.id, id), eq(notifications.userId, me.id))).returning({ id: notifications.id });
    if (!deleted.length) throw notFound("Notification not found.");
    res.json({ unreadCount: await unreadCount(me.id) });
  });

  return router;
}

import { Router, type RequestHandler } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { chatConversations, chatMessages } from "../db/schema.js";
import { currentUser, requireAuth, requireOnboarded, requireStudent } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { answerQuestion, buildStudentContext } from "../services/ai/assistant.js";
import { aiStatus } from "../services/ai/provider.js";
import { text } from "../validators/common.js";

/** One persistent conversation per student (cleared with DELETE). */
async function getConversation(userId: string, create: boolean) {
  const [existing] = await db.select().from(chatConversations).where(eq(chatConversations.userId, userId)).orderBy(desc(chatConversations.updatedAt)).limit(1);
  if (existing || !create) return existing ?? null;
  const [created] = await db.insert(chatConversations).values({ userId }).returning();
  return created;
}

export function assistantRouter(aiLimiter: RequestHandler) {
  const router = Router();
  router.use(requireAuth, requireStudent, requireOnboarded);

  router.get("/", async (req, res) => {
    const conversation = await getConversation(currentUser(req).id, false);
    const messages = conversation
      ? await db
          .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content, provider: chatMessages.provider, createdAt: chatMessages.createdAt })
          .from(chatMessages)
          .where(eq(chatMessages.conversationId, conversation.id))
          .orderBy(asc(chatMessages.createdAt))
          .limit(200)
      : [];
    res.json({ messages, ai: aiStatus() });
  });

  router.post("/messages", aiLimiter, async (req, res) => {
    const me = currentUser(req);
    const { message } = parse(z.object({ message: text(1, 1000, "Message") }), req.body);
    const conversation = (await getConversation(me.id, true))!;

    const history = await db
      .select({ role: chatMessages.role, content: chatMessages.content })
      .from(chatMessages)
      .where(eq(chatMessages.conversationId, conversation.id))
      .orderBy(desc(chatMessages.createdAt))
      .limit(10);

    const context = await buildStudentContext(db, me.id);
    const reply = await answerQuestion(context, history.reverse(), message);

    const [userMessage, assistantMessage] = await db.transaction(async (tx) => {
      const [u] = await tx.insert(chatMessages).values({ conversationId: conversation.id, role: "user", content: message }).returning();
      const [a] = await tx.insert(chatMessages).values({ conversationId: conversation.id, role: "assistant", content: reply.text, provider: reply.provider }).returning();
      await tx.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, conversation.id));
      return [u, a];
    });

    res.status(201).json({
      userMessage,
      assistantMessage,
      degraded: reply.degraded, // true when the AI provider failed and the basic assistant answered instead
      ai: aiStatus(),
    });
  });

  router.delete("/", async (req, res) => {
    await db.delete(chatConversations).where(eq(chatConversations.userId, currentUser(req).id));
    res.status(204).end();
  });

  return router;
}

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "../src/config/env.js";
import { db } from "../src/db/client.js";
import { buildStudentContext, contextToText } from "../src/services/ai/assistant.js";
import { generateText } from "../src/services/ai/provider.js";
import { adminClient, onboardedStudent, opportunityPayload, resetDb } from "./helpers.js";

beforeEach(resetDb);

describe("AI assistant (no provider configured)", () => {
  it("answers with the clearly labelled basic assistant and persists the chat", async () => {
    const admin = await adminClient();
    await admin.post("/api/admin/opportunities", opportunityPayload());
    const student = await onboardedStudent("s@test.dev", [["C++", 90], ["DSA", 85], ["OOP", 80]]);
    const status = await student.get("/api/assistant");
    expect(status.body.ai.mode).toBe("fallback");

    const res = await student.post("/api/assistant/messages", { message: "Which internships match my current skills?" });
    expect(res.status).toBe(201);
    expect(res.body.assistantMessage.provider).toBe("fallback");
    expect(res.body.assistantMessage.content).toContain("C++ Developer Internship");
    expect(res.body.assistantMessage.content).toContain("75%");

    expect((await student.get("/api/assistant")).body.messages).toHaveLength(2);
    expect((await student.del("/api/assistant")).status).toBe(204);
    expect((await student.get("/api/assistant")).body.messages).toHaveLength(0);
  });

  it("only gives the model the student's OWN data", async () => {
    const alice = await onboardedStudent("alice@test.dev", [["C++", 90], ["DSA", 85], ["Rust", 40]]);
    await onboardedStudent("bob@test.dev", [["Haskell", 90], ["Elixir", 85], ["Erlang", 80]]);
    const me = (await alice.get("/api/auth/me")).body.user;
    const text = contextToText(await buildStudentContext(db, me.id));
    expect(text).toContain("Rust");
    expect(text).not.toContain("Haskell");
  });
});

describe("AI provider adapters (mocked network)", () => {
  const saved = { ...env };
  afterEach(() => {
    Object.assign(env, saved);
    vi.unstubAllGlobals();
  });

  it("calls Anthropic with the server-side key and parses the reply", async () => {
    Object.assign(env, { AI_PROVIDER: "anthropic", AI_API_KEY: "sk-test", AI_MODEL: "test-model", aiEnabled: true, AI_BASE_URL: "" });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "Learn Git next." }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await generateText({ system: "sys", messages: [{ role: "user", content: "hi" }] });
    expect(result).toEqual({ text: "Learn Git next.", provider: "anthropic:test-model" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("sk-test");
  });

  it("calls OpenAI-compatible APIs and falls back gracefully on errors", async () => {
    Object.assign(env, { AI_PROVIDER: "openai", AI_API_KEY: "sk-test", AI_MODEL: "gpt-test", aiEnabled: true, AI_BASE_URL: "" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "Apply to TechNova." } }] }), { status: 200 })));
    expect((await generateText({ system: "s", messages: [{ role: "user", content: "q" }] })).text).toBe("Apply to TechNova.");

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 })));
    const student = await onboardedStudent("s@test.dev");
    const res = await student.post("/api/assistant/messages", { message: "How can I improve my profile?" });
    expect(res.status).toBe(201);
    expect(res.body.degraded).toBe(true); // UI tells the student the AI failed
    expect(res.body.assistantMessage.provider).toBe("fallback");
  });
});

describe("career progress tracker", () => {
  it("computes measured scores from real data with formulas and weekly goals", async () => {
    const admin = await adminClient();
    await admin.post("/api/admin/opportunities", opportunityPayload());
    const student = await onboardedStudent("s@test.dev", [["C++", 90], ["DSA", 80], ["OOP", 70]]);
    const res = await student.get("/api/career");
    expect(res.status).toBe(200);
    const { metrics, goals } = res.body;
    expect(metrics.parts.find((p: { key: string }) => p.key === "skills").score).toBe(80); // (90+80+70)/3
    expect(metrics.portfolio).toEqual({ projects: 0, certifications: 0, achievements: 0 }); // nothing invented
    expect(metrics.recommendedSkills[0].name).toBe("Git");
    expect(metrics.disclaimer).toMatch(/not a prediction/);
    const weighted = metrics.parts.reduce((s: number, p: { score: number; weight: number }) => s + p.score * p.weight, 0);
    expect(metrics.overall).toBe(Math.round(weighted));
    expect(goals.length).toBeGreaterThan(0);

    const goal = goals[0];
    expect((await student.patch(`/api/career/goals/${goal.id}`, { status: "DONE" })).body.goal.status).toBe("DONE");
    const refreshed = await student.post("/api/career/refresh");
    expect(refreshed.body.recommendations.source).toBe("rules");
    expect((await student.get("/api/career")).body.history).toHaveLength(1);
  });
});

describe("notifications", () => {
  it("tracks unread state, mark one, mark all, and ownership", async () => {
    const a = await onboardedStudent("a@test.dev");
    const b = await onboardedStudent("b@test.dev");
    const list = (await a.get("/api/notifications")).body;
    expect(list.unreadCount).toBeGreaterThan(0);
    const first = list.notifications[0];
    expect((await b.post(`/api/notifications/${first.id}/read`)).status).toBe(404);
    const afterOne = await a.post(`/api/notifications/${first.id}/read`);
    expect(afterOne.body.unreadCount).toBe(list.unreadCount - 1);
    await a.post("/api/notifications/read-all");
    expect((await a.get("/api/notifications")).body.unreadCount).toBe(0);
  });
});

describe("admin management", () => {
  it("reports totals and can deactivate a student (logging them out)", async () => {
    const admin = await adminClient();
    const student = await onboardedStudent("s@test.dev");
    const stats = (await admin.get("/api/admin/stats")).body;
    expect(stats.totals.students).toBe(1);
    const list = (await admin.get("/api/admin/students?q=s@test")).body;
    expect(list.students).toHaveLength(1);
    await admin.patch(`/api/admin/students/${list.students[0].id}`, { isActive: false });
    expect((await student.get("/api/auth/me")).status).toBe(401);
  });

  it("publishes/unpublishes and deletes opportunities", async () => {
    const admin = await adminClient();
    const student = await onboardedStudent("s@test.dev");
    const opp = (await admin.post("/api/admin/opportunities", opportunityPayload())).body.opportunity;
    await admin.patch(`/api/admin/opportunities/${opp.id}/publish`, { isPublished: false });
    expect((await student.get("/api/opportunities")).body.total).toBe(0);
    await admin.patch(`/api/admin/opportunities/${opp.id}/publish`, { isPublished: true });
    expect((await student.get("/api/opportunities")).body.total).toBe(1);
    expect((await admin.del(`/api/admin/opportunities/${opp.id}`)).status).toBe(204);
    expect((await student.get("/api/opportunities")).body.total).toBe(0);
  });

  it("validates opportunity input on the server", async () => {
    const admin = await adminClient();
    const res = await admin.post("/api/admin/opportunities", opportunityPayload({ title: "", requiredSkills: [], type: "PARTY" }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
  });
});

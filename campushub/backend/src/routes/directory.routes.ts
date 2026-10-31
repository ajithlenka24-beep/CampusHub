import { Router } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { projects, studentProfiles } from "../db/schema.js";
import { currentUser, requireAuth, requireOnboarded } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { loadStudentCards } from "../services/people.js";
import { searchSkillCatalog } from "../services/skills.js";
import { notFound } from "../utils/httpError.js";
import { uuidParam } from "../validators/common.js";

export function directoryRouter() {
  const router = Router();
  router.use(requireAuth);

  /** Skill catalogue (autocomplete for profile, opportunities and teams). */
  router.get("/skills", async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional().default("") }), req.query);
    res.json({ skills: await searchSkillCatalog(db, q, 20) });
  });

  router.get("/students", requireOnboarded, async (req, res) => {
    const query = parse(z.object({ q: z.string().trim().max(80).optional().default(""), skill: z.string().trim().max(60).optional().default("") }), req.query);
    const students = await loadStudentCards({ excludeUserId: currentUser(req).id, q: query.q, skill: query.skill, limit: 60 });
    res.json({ students });
  });

  router.get("/students/:id", requireOnboarded, async (req, res) => {
    const { id } = parse(uuidParam, req.params);
    const [card] = await loadStudentCards({ ids: [id] });
    if (!card) throw notFound("Student not found.");
    const [profile] = await db
      .select({ bio: studentProfiles.bio, department: studentProfiles.department, githubUrl: studentProfiles.githubUrl, linkedinUrl: studentProfiles.linkedinUrl, portfolioUrl: studentProfiles.portfolioUrl })
      .from(studentProfiles)
      .where(eq(studentProfiles.userId, id));
    const projectRows = await db
      .select({ id: projects.id, title: projects.title, description: projects.description, technologies: projects.technologies, githubUrl: projects.githubUrl, liveUrl: projects.liveUrl })
      .from(projects)
      .where(eq(projects.userId, id));
    res.json({ student: { ...card, ...profile, projects: projectRows } });
  });

  return router;
}

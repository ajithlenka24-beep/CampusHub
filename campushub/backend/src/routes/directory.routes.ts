import { Router } from "express";
import { z } from "zod";
import { db } from "../db/client.js";
import { currentUser, requireAuth, requireOnboarded } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { loadStudentCards } from "../services/people.js";
import { searchSkillCatalog } from "../services/skills.js";

export function directoryRouter() {
  const router = Router();
  router.use(requireAuth);

  /** Skill catalogue (autocomplete for profile, opportunities and teams). */
  router.get("/skills", async (req, res) => {
    const { q } = parse(z.object({ q: z.string().trim().max(60).optional().default("") }), req.query);
    res.json({ skills: await searchSkillCatalog(db, q, 20, currentUser(req).id) });
  });

  /**
   * Teammate directory: only students who opted in ("Show me in teammate search"), and only
   * their public card (name, course, college, semester, picture, skills). Bio, links, projects,
   * achievements, certifications, applications and email are never listed here.
   * (There is deliberately no endpoint for reading another student's full profile.)
   */
  router.get("/students", requireOnboarded, async (req, res) => {
    const query = parse(z.object({ q: z.string().trim().max(80).optional().default(""), skill: z.string().trim().max(60).optional().default("") }), req.query);
    const students = await loadStudentCards({ excludeUserId: currentUser(req).id, q: query.q, skill: query.skill, limit: 60 });
    res.json({ students });
  });

  return router;
}

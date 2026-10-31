import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { achievements, certifications, projects, studentProfiles, studentSkills, users } from "../db/schema.js";
import { currentUser, requireAuth, requireStudent } from "../middleware/auth.js";
import { imageUpload, removeUpload, saveImage } from "../middleware/upload.js";
import { parse } from "../middleware/validate.js";
import { notifyNewStrongMatches, snapshotMatches } from "../services/alerts.js";
import { logActivity } from "../services/activity.js";
import { proficiencyLevel } from "../services/skillNormalizer.js";
import { getOrCreateSkills } from "../services/skills.js";
import { getProfileCompletion, getStudentSkills } from "../services/studentData.js";
import { badRequest, conflict, notFound } from "../utils/httpError.js";
import { isoDate, optionalText, optionalUrl, proficiency, semester, text, uuidParam, intParam } from "../validators/common.js";
import { publicUser } from "./auth.routes.js";

const personalSchema = z.object({
  fullName: text(2, 120, "Full name"),
  college: text(2, 160, "College"),
  course: text(2, 120, "Course"),
  department: optionalText(120, "Department"),
  semester,
  bio: optionalText(600, "Introduction"),
  githubUrl: optionalUrl("GitHub link"),
  linkedinUrl: optionalUrl("LinkedIn link"),
  portfolioUrl: optionalUrl("Portfolio link"),
});

const skillSchema = z.object({
  name: text(1, 60, "Skill name"),
  proficiency,
  experienceMonths: z.coerce.number().int().min(0).max(240).optional().default(0),
});

const onboardingSchema = z.object({
  college: text(2, 160, "College"),
  course: text(2, 120, "Course"),
  department: optionalText(120, "Department"),
  semester,
  bio: text(30, 600, "Introduction"),
  githubUrl: optionalUrl("GitHub link"),
  linkedinUrl: optionalUrl("LinkedIn link"),
  skills: z.array(skillSchema).min(3, "Add at least 3 skills.").max(30, "You can add up to 30 skills."),
});

const projectSchema = z.object({
  title: text(2, 120, "Project title"),
  description: text(10, 2000, "Project description"),
  technologies: z.array(z.string().trim().min(1).max(40)).max(15, "Up to 15 technologies.").optional().default([]),
  githubUrl: optionalUrl("GitHub link"),
  liveUrl: optionalUrl("Live project link"),
});

const achievementSchema = z.object({
  title: text(2, 120, "Achievement title"),
  description: optionalText(1000, "Description"),
  achievedOn: isoDate,
});

const certificationSchema = z.object({
  name: text(2, 120, "Certification name"),
  issuer: text(2, 120, "Issuing organisation"),
  issueDate: isoDate,
  credentialUrl: optionalUrl("Credential link"),
});

/** Everything on the student's own profile page, plus completion recommendations. */
export async function loadFullProfile(userId: string) {
  const [account] = await db
    .select({ id: users.id, email: users.email, fullName: users.fullName, emailVerifiedAt: users.emailVerifiedAt, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId));
  const [profile] = await db.select().from(studentProfiles).where(eq(studentProfiles.userId, userId));
  const [skillRows, projectRows, achievementRows, certificationRows, completion] = await Promise.all([
    getStudentSkills(db, userId),
    db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt)),
    db.select().from(achievements).where(eq(achievements.userId, userId)).orderBy(desc(achievements.achievedOn), desc(achievements.createdAt)),
    db.select().from(certifications).where(eq(certifications.userId, userId)).orderBy(desc(certifications.issueDate), desc(certifications.createdAt)),
    getProfileCompletion(db, userId),
  ]);

  return {
    account: { ...account, emailVerified: Boolean(account?.emailVerifiedAt) },
    profile,
    skills: skillRows.map((s) => ({ ...s, level: proficiencyLevel(s.proficiency) })),
    projects: projectRows,
    achievements: achievementRows,
    certifications: certificationRows,
    completion,
  };
}

export function profileRouter() {
  const router = Router();
  router.use(requireAuth, requireStudent);

  router.get("/", async (req, res) => {
    res.json(await loadFullProfile(currentUser(req).id));
  });

  router.put("/", async (req, res) => {
    const me = currentUser(req);
    const data = parse(personalSchema, req.body);
    await db.transaction(async (tx) => {
      await tx.update(users).set({ fullName: data.fullName }).where(eq(users.id, me.id));
      await tx
        .update(studentProfiles)
        .set({
          college: data.college,
          course: data.course,
          department: data.department,
          semester: data.semester,
          bio: data.bio,
          githubUrl: data.githubUrl,
          linkedinUrl: data.linkedinUrl,
          portfolioUrl: data.portfolioUrl,
        })
        .where(eq(studentProfiles.userId, me.id));
    });
    res.json(await loadFullProfile(me.id));
  });

  /** Mandatory onboarding: academic details, introduction and at least 3 skills. */
  router.post("/onboarding", async (req, res) => {
    const me = currentUser(req);
    const data = parse(onboardingSchema, req.body);
    const names = data.skills.map((s) => s.name.toLowerCase());
    if (new Set(names).size !== names.length) throw badRequest("Each skill can only be added once.");

    await db.transaction(async (tx) => {
      await tx
        .update(studentProfiles)
        .set({
          college: data.college,
          course: data.course,
          department: data.department,
          semester: data.semester,
          bio: data.bio,
          githubUrl: data.githubUrl,
          linkedinUrl: data.linkedinUrl,
        })
        .where(eq(studentProfiles.userId, me.id));
      const refs = await getOrCreateSkills(tx, data.skills.map((s) => s.name));
      await tx.delete(studentSkills).where(eq(studentSkills.userId, me.id));
      await tx.insert(studentSkills).values(
        refs.map((ref, i) => ({ userId: me.id, skillId: ref.id, proficiency: data.skills[i].proficiency, experienceMonths: data.skills[i].experienceMonths })),
      );
      await tx.update(users).set({ onboardingCompleted: true }).where(eq(users.id, me.id));
    });
    await notifyNewStrongMatches(db, me.id, new Map());
    await logActivity(db, { actorId: me.id, action: "ONBOARDING_COMPLETED", entityType: "user", entityId: me.id });
    res.json({ user: await publicUser(me.id) });
  });

  /* ---------------- avatar */
  router.post("/avatar", imageUpload.single("image"), async (req, res) => {
    const me = currentUser(req);
    const url = await saveImage(req.file, "avatars");
    const [old] = await db.select({ avatarUrl: studentProfiles.avatarUrl }).from(studentProfiles).where(eq(studentProfiles.userId, me.id));
    await db.update(studentProfiles).set({ avatarUrl: url }).where(eq(studentProfiles.userId, me.id));
    await removeUpload(old?.avatarUrl);
    res.json({ avatarUrl: url });
  });

  router.delete("/avatar", async (req, res) => {
    const me = currentUser(req);
    const [old] = await db.select({ avatarUrl: studentProfiles.avatarUrl }).from(studentProfiles).where(eq(studentProfiles.userId, me.id));
    await db.update(studentProfiles).set({ avatarUrl: null }).where(eq(studentProfiles.userId, me.id));
    await removeUpload(old?.avatarUrl);
    res.json({ avatarUrl: null });
  });

  /* ---------------- skills (changing skills re-runs matching and may trigger "new match" alerts) */
  router.get("/skills", async (req, res) => {
    const rows = await getStudentSkills(db, currentUser(req).id);
    res.json({ skills: rows.map((s) => ({ ...s, level: proficiencyLevel(s.proficiency) })) });
  });

  router.post("/skills", async (req, res) => {
    const me = currentUser(req);
    const data = parse(skillSchema, req.body);
    const before = await snapshotMatches(db, me.id);
    const [ref] = await getOrCreateSkills(db, [data.name]);
    const [exists] = await db.select({ id: studentSkills.id }).from(studentSkills).where(and(eq(studentSkills.userId, me.id), eq(studentSkills.skillId, ref.id)));
    if (exists) throw conflict(`${ref.name} is already in your skills. Edit it instead.`, "SKILL_EXISTS");
    const [created] = await db
      .insert(studentSkills)
      .values({ userId: me.id, skillId: ref.id, proficiency: data.proficiency, experienceMonths: data.experienceMonths })
      .returning();
    await notifyNewStrongMatches(db, me.id, before);
    res.status(201).json({ skill: { ...created, name: ref.name } });
  });

  router.put("/skills/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(intParam, req.params);
    const data = parse(skillSchema.omit({ name: true }), req.body);
    const [updated] = await db
      .update(studentSkills)
      .set({ proficiency: data.proficiency, experienceMonths: data.experienceMonths })
      .where(and(eq(studentSkills.id, id), eq(studentSkills.userId, me.id)))
      .returning();
    if (!updated) throw notFound("Skill not found.");
    res.json({ skill: updated });
  });

  router.delete("/skills/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(intParam, req.params);
    const deleted = await db.delete(studentSkills).where(and(eq(studentSkills.id, id), eq(studentSkills.userId, me.id))).returning({ id: studentSkills.id });
    if (!deleted.length) throw notFound("Skill not found.");
    res.status(204).end();
  });

  /* ---------------- projects */
  router.post("/projects", async (req, res) => {
    const me = currentUser(req);
    const data = parse(projectSchema, req.body);
    const [created] = await db.insert(projects).values({ ...data, userId: me.id }).returning();
    res.status(201).json({ project: created });
  });

  router.put("/projects/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const data = parse(projectSchema, req.body);
    const [updated] = await db.update(projects).set(data).where(and(eq(projects.id, id), eq(projects.userId, me.id))).returning();
    if (!updated) throw notFound("Project not found.");
    res.json({ project: updated });
  });

  router.post("/projects/:id/image", imageUpload.single("image"), async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const [project] = await db.select().from(projects).where(and(eq(projects.id, id), eq(projects.userId, me.id)));
    if (!project) throw notFound("Project not found.");
    const url = await saveImage(req.file, "projects");
    await db.update(projects).set({ imageUrl: url }).where(eq(projects.id, id));
    await removeUpload(project.imageUrl);
    res.json({ imageUrl: url });
  });

  router.delete("/projects/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const [deleted] = await db.delete(projects).where(and(eq(projects.id, id), eq(projects.userId, me.id))).returning();
    if (!deleted) throw notFound("Project not found.");
    await removeUpload(deleted.imageUrl);
    res.status(204).end();
  });

  /* ---------------- achievements */
  router.post("/achievements", async (req, res) => {
    const me = currentUser(req);
    const data = parse(achievementSchema, req.body);
    const [created] = await db.insert(achievements).values({ ...data, userId: me.id }).returning();
    res.status(201).json({ achievement: created });
  });

  router.put("/achievements/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const data = parse(achievementSchema, req.body);
    const [updated] = await db.update(achievements).set(data).where(and(eq(achievements.id, id), eq(achievements.userId, me.id))).returning();
    if (!updated) throw notFound("Achievement not found.");
    res.json({ achievement: updated });
  });

  router.delete("/achievements/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const deleted = await db.delete(achievements).where(and(eq(achievements.id, id), eq(achievements.userId, me.id))).returning({ id: achievements.id });
    if (!deleted.length) throw notFound("Achievement not found.");
    res.status(204).end();
  });

  /* ---------------- certifications */
  router.post("/certifications", async (req, res) => {
    const me = currentUser(req);
    const data = parse(certificationSchema, req.body);
    const [created] = await db.insert(certifications).values({ ...data, userId: me.id }).returning();
    res.status(201).json({ certification: created });
  });

  router.put("/certifications/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const data = parse(certificationSchema, req.body);
    const [updated] = await db.update(certifications).set(data).where(and(eq(certifications.id, id), eq(certifications.userId, me.id))).returning();
    if (!updated) throw notFound("Certification not found.");
    res.json({ certification: updated });
  });

  router.delete("/certifications/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const deleted = await db.delete(certifications).where(and(eq(certifications.id, id), eq(certifications.userId, me.id))).returning({ id: certifications.id });
    if (!deleted.length) throw notFound("Certification not found.");
    res.status(204).end();
  });

  return router;
}


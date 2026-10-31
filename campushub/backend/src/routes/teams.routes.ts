import { Router } from "express";
import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "../db/client.js";
import { teamInvitations, teamMembers, teamRequiredSkills, teams, users } from "../db/schema.js";
import { currentUser, requireAuth, requireOnboarded, requireStudent } from "../middleware/auth.js";
import { parse } from "../middleware/validate.js";
import { logActivity } from "../services/activity.js";
import { candidateFit } from "../services/engines.js";
import { notify, notifyMany } from "../services/notifications.js";
import { AREA_NAMES } from "../services/skillNormalizer.js";
import { getOrCreateSkills } from "../services/skills.js";
import { badRequest, conflict, forbidden, notFound } from "../utils/httpError.js";
import { optionalText, text, uuidParam } from "../validators/common.js";
import { loadStudentCards, loadTeam } from "../services/people.js";

const MAX_TEAM_SIZE = 10;

const teamSchema = z.object({
  name: text(2, 80, "Team name"),
  projectTitle: text(2, 140, "Project title"),
  description: optionalText(1500, "Description"),
  maxSize: z.coerce.number().int().min(2, "A team needs room for at least 2 people.").max(MAX_TEAM_SIZE, `Teams can have at most ${MAX_TEAM_SIZE} members.`),
  requiredSkills: z.array(z.string().trim().min(1).max(60)).max(20, "Up to 20 required skills.").optional().default([]),
});

async function memberCount(dbx: DbOrTx, teamId: string) {
  const [row] = await dbx.select({ n: count() }).from(teamMembers).where(eq(teamMembers.teamId, teamId));
  return Number(row?.n ?? 0);
}

async function isMember(teamId: string, userId: string) {
  const [row] = await db.select({ userId: teamMembers.userId }).from(teamMembers).where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
  return Boolean(row);
}

async function setRequiredSkills(dbx: DbOrTx, teamId: string, names: string[]) {
  await dbx.delete(teamRequiredSkills).where(eq(teamRequiredSkills.teamId, teamId));
  const refs = await getOrCreateSkills(dbx, names);
  if (refs.length) await dbx.insert(teamRequiredSkills).values(refs.map((r) => ({ teamId, skillId: r.id })));
}

export function teamsRouter() {
  const router = Router();
  router.use(requireAuth, requireStudent, requireOnboarded);

  /** My teams + invitations waiting for my answer. */
  router.get("/", async (req, res) => {
    const me = currentUser(req);
    const memberships = await db.select({ teamId: teamMembers.teamId }).from(teamMembers).where(eq(teamMembers.userId, me.id));
    const myTeams = [];
    for (const { teamId } of memberships) {
      const team = await loadTeam(db, teamId);
      if (team) myTeams.push(team);
    }

    const invites = await db
      .select({
        id: teamInvitations.id,
        message: teamInvitations.message,
        createdAt: teamInvitations.createdAt,
        teamId: teams.id,
        teamName: teams.name,
        projectTitle: teams.projectTitle,
        inviterName: users.fullName,
      })
      .from(teamInvitations)
      .innerJoin(teams, eq(teams.id, teamInvitations.teamId))
      .innerJoin(users, eq(users.id, teamInvitations.inviterId))
      .where(and(eq(teamInvitations.inviteeId, me.id), eq(teamInvitations.status, "PENDING")))
      .orderBy(desc(teamInvitations.createdAt));

    res.json({ teams: myTeams, invitations: invites });
  });

  router.post("/", async (req, res) => {
    const me = currentUser(req);
    const data = parse(teamSchema, req.body);
    const teamId = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({ name: data.name, projectTitle: data.projectTitle, description: data.description, maxSize: data.maxSize, ownerId: me.id })
        .returning({ id: teams.id });
      await tx.insert(teamMembers).values({ teamId: team.id, userId: me.id });
      await setRequiredSkills(tx, team.id, data.requiredSkills);
      return team.id;
    });
    await logActivity(db, { actorId: me.id, action: "TEAM_CREATED", entityType: "team", entityId: teamId, details: { name: data.name } });
    res.status(201).json({ team: await loadTeam(db, teamId) });
  });

  router.get("/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const team = await loadTeam(db, id);
    if (!team) throw notFound("Team not found.");
    const member = team.members.some((m) => m.userId === me.id);
    if (!member) {
      // someone with a pending invitation may preview the team before accepting
      const [invite] = await db
        .select({ id: teamInvitations.id })
        .from(teamInvitations)
        .where(and(eq(teamInvitations.teamId, id), eq(teamInvitations.inviteeId, me.id), eq(teamInvitations.status, "PENDING")));
      if (!invite) throw notFound("Team not found.");
    }

    const pending =
      team.ownerId === me.id
        ? await db
            .select({ id: teamInvitations.id, inviteeId: teamInvitations.inviteeId, inviteeName: users.fullName, createdAt: teamInvitations.createdAt })
            .from(teamInvitations)
            .innerJoin(users, eq(users.id, teamInvitations.inviteeId))
            .where(and(eq(teamInvitations.teamId, id), eq(teamInvitations.status, "PENDING")))
        : [];
    res.json({ team, isOwner: team.ownerId === me.id, isMember: member, pendingInvitations: pending });
  });

  router.put("/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const data = parse(teamSchema, req.body);
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    if (!team || !(await isMember(id, me.id))) throw notFound("Team not found.");
    if (team.ownerId !== me.id) throw forbidden("Only the team owner can edit the team.");
    if (data.maxSize < (await memberCount(db, id))) throw badRequest("Maximum size cannot be smaller than the current number of members.");
    await db.transaction(async (tx) => {
      await tx.update(teams).set({ name: data.name, projectTitle: data.projectTitle, description: data.description, maxSize: data.maxSize }).where(eq(teams.id, id));
      await setRequiredSkills(tx, id, data.requiredSkills);
    });
    res.json({ team: await loadTeam(db, id) });
  });

  router.delete("/:id", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    if (!team || !(await isMember(id, me.id))) throw notFound("Team not found.");
    if (team.ownerId !== me.id) throw forbidden("Only the team owner can delete the team.");
    const others = (await db.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, id))).map((m) => m.userId).filter((u) => u !== me.id);
    await db.transaction(async (tx) => {
      await tx.delete(teams).where(eq(teams.id, id));
      await notifyMany(tx, others, { type: "TEAM_UPDATE", title: "Team deleted", message: `${team.name} was deleted by its owner.`, link: "/teams" });
    });
    res.status(204).end();
  });

  /** Students ranked by how well they would fill this team's gaps. */
  router.get("/:id/suggestions", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { q, skill } = parse(z.object({ q: z.string().trim().max(80).optional().default(""), skill: z.string().trim().max(60).optional().default("") }), req.query);
    const team = await loadTeam(db, id);
    if (!team || !team.members.some((m) => m.userId === me.id)) throw notFound("Team not found.");

    const pendingIds = (
      await db.select({ inviteeId: teamInvitations.inviteeId }).from(teamInvitations).where(and(eq(teamInvitations.teamId, id), eq(teamInvitations.status, "PENDING")))
    ).map((r) => r.inviteeId);
    const exclude = new Set([...team.members.map((m) => m.userId), ...pendingIds]);

    const candidates = (await loadStudentCards({ excludeUserId: me.id, q, skill, limit: 200 }))
      .filter((c) => !exclude.has(c.id))
      .map((c) => {
        const fit = candidateFit(team.analysis, c.skills.map((s) => s.name), team.requiredSkills.map((s) => s.name));
        return { ...c, fit };
      })
      .sort((a, b) => b.fit.score - a.fit.score || a.fullName.localeCompare(b.fullName))
      .slice(0, 30);
    res.json({ candidates });
  });

  router.post("/:id/invitations", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const data = parse(z.object({ inviteeId: z.uuid({ error: "Choose a student to invite." }), message: optionalText(300, "Message") }), req.body);
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    if (!team || !(await isMember(id, me.id))) throw notFound("Team not found.");
    if (team.ownerId !== me.id) throw forbidden("Only the team owner can send invitations.");
    if (data.inviteeId === me.id) throw badRequest("You are already in this team.");

    const [invitee] = await loadStudentCards({ ids: [data.inviteeId] });
    if (!invitee) throw notFound("That student could not be found.");
    if (await isMember(id, data.inviteeId)) throw conflict(`${invitee.fullName} is already a member of this team.`, "ALREADY_MEMBER");

    const members = await memberCount(db, id);
    const [pending] = await db.select({ n: count() }).from(teamInvitations).where(and(eq(teamInvitations.teamId, id), eq(teamInvitations.status, "PENDING")));
    if (members + Number(pending?.n ?? 0) >= team.maxSize) {
      throw badRequest(`This team is limited to ${team.maxSize} members (including pending invitations).`);
    }

    try {
      const [invitation] = await db.insert(teamInvitations).values({ teamId: id, inviterId: me.id, inviteeId: data.inviteeId, message: data.message }).returning();
      await notify(db, data.inviteeId, {
        type: "TEAM_INVITE",
        title: "Team invitation",
        message: `${me.fullName} invited you to join ${team.name} (${team.projectTitle}).`,
        link: "/teams",
      });
      res.status(201).json({ invitation });
    } catch (error) {
      if ((error as { code?: string }).code === "23505" || (error as { cause?: { code?: string } }).cause?.code === "23505") {
        throw conflict(`${invitee.fullName} already has a pending invitation to this team.`, "DUPLICATE_INVITATION");
      }
      throw error;
    }
  });

  router.delete("/:id/invitations/:invitationId", async (req, res) => {
    const me = currentUser(req);
    const params = parse(z.object({ id: z.uuid(), invitationId: z.uuid() }), req.params);
    const [team] = await db.select().from(teams).where(eq(teams.id, params.id));
    if (!team || team.ownerId !== me.id) throw notFound("Team not found.");
    const updated = await db
      .update(teamInvitations)
      .set({ status: "CANCELLED", respondedAt: new Date() })
      .where(and(eq(teamInvitations.id, params.invitationId), eq(teamInvitations.teamId, params.id), eq(teamInvitations.status, "PENDING")))
      .returning({ id: teamInvitations.id });
    if (!updated.length) throw notFound("Invitation not found.");
    res.status(204).end();
  });

  /** Members can pick their preferred role area (or leave it on auto-detect). */
  router.put("/:id/members/me", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const { roleArea } = parse(z.object({ roleArea: z.union([z.enum(AREA_NAMES as [string, ...string[]]), z.literal("")]) }), req.body);
    const updated = await db
      .update(teamMembers)
      .set({ roleArea })
      .where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, me.id)))
      .returning({ userId: teamMembers.userId });
    if (!updated.length) throw notFound("Team not found.");
    res.json({ team: await loadTeam(db, id) });
  });

  router.delete("/:id/members/:userId", async (req, res) => {
    const me = currentUser(req);
    const params = parse(z.object({ id: z.uuid(), userId: z.uuid() }), req.params);
    const [team] = await db.select().from(teams).where(eq(teams.id, params.id));
    if (!team || !(await isMember(params.id, me.id))) throw notFound("Team not found.");
    if (team.ownerId !== me.id) throw forbidden("Only the team owner can remove members.");
    if (params.userId === me.id) throw badRequest("Use 'Leave team' or delete the team instead.");
    const removed = await db.delete(teamMembers).where(and(eq(teamMembers.teamId, params.id), eq(teamMembers.userId, params.userId))).returning();
    if (!removed.length) throw notFound("That student is not in this team.");
    await notify(db, params.userId, { type: "TEAM_UPDATE", title: "Removed from team", message: `You were removed from ${team.name}.`, link: "/teams" });
    res.json({ team: await loadTeam(db, params.id) });
  });

  /** Leaving: if the owner leaves, ownership passes to the longest-standing member. */
  router.post("/:id/leave", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    if (!team || !(await isMember(id, me.id))) throw notFound("Team not found.");

    await db.transaction(async (tx) => {
      await tx.delete(teamMembers).where(and(eq(teamMembers.teamId, id), eq(teamMembers.userId, me.id)));
      const remaining = await tx.select({ userId: teamMembers.userId }).from(teamMembers).where(eq(teamMembers.teamId, id)).orderBy(asc(teamMembers.joinedAt));
      if (!remaining.length) {
        await tx.delete(teams).where(eq(teams.id, id));
        return;
      }
      if (team.ownerId === me.id) {
        await tx.update(teams).set({ ownerId: remaining[0].userId }).where(eq(teams.id, id));
        await notify(tx, remaining[0].userId, { type: "TEAM_UPDATE", title: "You are now the team owner", message: `${me.fullName} left ${team.name}, so you are now its owner.`, link: `/teams/${id}` });
      } else {
        await notify(tx, team.ownerId, { type: "TEAM_UPDATE", title: "A member left your team", message: `${me.fullName} left ${team.name}.`, link: `/teams/${id}` });
      }
    });
    res.json({ message: `You left ${team.name}.` });
  });

  return router;
}

/** Invitation answers live at /api/invitations/:id/(accept|decline). */
export function invitationsRouter() {
  const router = Router();
  router.use(requireAuth, requireStudent, requireOnboarded);

  async function pendingInvitation(invitationId: string, userId: string) {
    const [invitation] = await db
      .select()
      .from(teamInvitations)
      .where(and(eq(teamInvitations.id, invitationId), eq(teamInvitations.inviteeId, userId), eq(teamInvitations.status, "PENDING")));
    if (!invitation) throw notFound("This invitation is no longer available.");
    return invitation;
  }

  router.post("/:id/accept", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const invitation = await pendingInvitation(id, me.id);
    const [team] = await db.select().from(teams).where(eq(teams.id, invitation.teamId));
    if (!team) throw notFound("This team no longer exists.");

    await db.transaction(async (tx) => {
      if ((await memberCount(tx, team.id)) >= team.maxSize) throw badRequest(`${team.name} is already full (${team.maxSize} members).`);
      await tx.insert(teamMembers).values({ teamId: team.id, userId: me.id }).onConflictDoNothing();
      await tx.update(teamInvitations).set({ status: "ACCEPTED", respondedAt: new Date() }).where(eq(teamInvitations.id, id));
      await notify(tx, invitation.inviterId, {
        type: "TEAM_UPDATE",
        title: "Invitation accepted",
        message: `${me.fullName} accepted your invitation and joined ${team.name}.`,
        link: `/teams/${team.id}`,
      });
    });
    await logActivity(db, { actorId: me.id, action: "TEAM_JOINED", entityType: "team", entityId: team.id });
    res.json({ team: await loadTeam(db, team.id) });
  });

  router.post("/:id/decline", async (req, res) => {
    const me = currentUser(req);
    const { id } = parse(uuidParam, req.params);
    const invitation = await pendingInvitation(id, me.id);
    await db.update(teamInvitations).set({ status: "DECLINED", respondedAt: new Date() }).where(eq(teamInvitations.id, id));
    const [team] = await db.select({ name: teams.name }).from(teams).where(eq(teams.id, invitation.teamId));
    await notify(db, invitation.inviterId, { type: "TEAM_UPDATE", title: "Invitation declined", message: `${me.fullName} declined the invitation to ${team?.name ?? "your team"}.`, link: "/teams" });
    res.json({ message: "Invitation declined." });
  });

  return router;
}


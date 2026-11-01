/**
 * CampusHub database schema (PostgreSQL, Drizzle ORM).
 *
 * Normalised design:
 *  - users (auth) 1—1 student_profiles
 *  - skills is a shared catalogue; student_skills, opportunity_skills and
 *    team_required_skills link to it, so skill matching compares skill IDs.
 *  - applications keep a full status history (application_status_history).
 *  - teams have members and invitations (one pending invite per student per team).
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/* ------------------------------------------------------------------ enums */
export const userRole = pgEnum("user_role", ["STUDENT", "ADMIN"]);

export const skillCategory = pgEnum("skill_category", [
  "PROGRAMMING",
  "WEB",
  "DATABASE",
  "CORE_CS",
  "AI_ML",
  "DESIGN",
  "TESTING",
  "DEVOPS",
  "SOFT_SKILL",
  "OTHER",
]);

export const opportunityType = pgEnum("opportunity_type", [
  "INTERNSHIP",
  "HACKATHON",
  "WORKSHOP",
  "COMPETITION",
  "RESEARCH",
  "CAMPUS_EVENT",
  "PROJECT",
]);

export const workMode = pgEnum("work_mode", ["ONSITE", "REMOTE", "HYBRID"]);

export const applicationStatus = pgEnum("application_status", [
  "APPLIED",
  "SHORTLISTED",
  "INTERVIEW",
  "SELECTED",
  "REJECTED",
  "WITHDRAWN",
]);

export const invitationStatus = pgEnum("invitation_status", ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED"]);

export const chatRole = pgEnum("chat_role", ["user", "assistant"]);

export const goalStatus = pgEnum("goal_status", ["OPEN", "DONE"]);

/* ------------------------------------------------------------------ auth */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    fullName: varchar("full_name", { length: 120 }).notNull(),
    role: userRole("role").notNull().default("STUDENT"),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email), index("users_role_idx").on(t.role)],
);

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 hash of the random session token (the raw token only lives in the cookie)
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: varchar("user_agent", { length: 255 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);

export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("email_verification_token_unique").on(t.tokenHash), index("email_verification_user_idx").on(t.userId)],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("password_reset_token_unique").on(t.tokenHash), index("password_reset_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ profile */
export const studentProfiles = pgTable("student_profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  college: varchar("college", { length: 160 }).notNull().default(""),
  course: varchar("course", { length: 120 }).notNull().default(""),
  department: varchar("department", { length: 120 }).notNull().default(""),
  semester: integer("semester"),
  bio: text("bio").notNull().default(""),
  avatarUrl: varchar("avatar_url", { length: 255 }),
  githubUrl: varchar("github_url", { length: 255 }),
  linkedinUrl: varchar("linkedin_url", { length: 255 }),
  portfolioUrl: varchar("portfolio_url", { length: 255 }),
  // Opt-in: list this student in Group Up teammate search (name, course, college and skills only).
  // Off by default so a new account shares nothing until the student chooses to.
  showInDirectory: boolean("show_in_directory").notNull().default(false),
  ...timestamps,
});

export const skills = pgTable(
  "skills",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 60 }).notNull(),
    // canonical lowercase name ("JS" and "javascript" both become "javascript")
    normalizedName: varchar("normalized_name", { length: 60 }).notNull(),
    category: skillCategory("category").notNull().default("OTHER"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("skills_normalized_unique").on(t.normalizedName)],
);

export const studentSkills = pgTable(
  "student_skills",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
    proficiency: integer("proficiency").notNull(), // 0–100
    experienceMonths: integer("experience_months").notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex("student_skill_unique").on(t.userId, t.skillId), index("student_skills_skill_idx").on(t.skillId)],
);

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    technologies: text("technologies").array().notNull().default(sql`ARRAY[]::text[]`),
    githubUrl: varchar("github_url", { length: 255 }),
    liveUrl: varchar("live_url", { length: 255 }),
    imageUrl: varchar("image_url", { length: 255 }),
    ...timestamps,
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull(),
    description: text("description").notNull().default(""),
    achievedOn: date("achieved_on"),
    ...timestamps,
  },
  (t) => [index("achievements_user_idx").on(t.userId)],
);

export const certifications = pgTable(
  "certifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    issuer: varchar("issuer", { length: 120 }).notNull(),
    issueDate: date("issue_date"),
    credentialUrl: varchar("credential_url", { length: 255 }),
    ...timestamps,
  },
  (t) => [index("certifications_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ opportunities */
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 140 }).notNull(),
    organization: varchar("organization", { length: 120 }).notNull(),
    description: text("description").notNull(),
    type: opportunityType("type").notNull(),
    eligibility: text("eligibility").notNull().default(""),
    location: varchar("location", { length: 120 }).notNull().default(""),
    workMode: workMode("work_mode").notNull().default("ONSITE"),
    deadline: timestamp("deadline", { withTimezone: true }).notNull(),
    applicationUrl: varchar("application_url", { length: 255 }),
    isPublished: boolean("is_published").notNull().default(true),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    ...timestamps,
  },
  (t) => [
    index("opportunities_deadline_idx").on(t.deadline),
    index("opportunities_type_idx").on(t.type),
    index("opportunities_published_idx").on(t.isPublished),
  ],
);

export const opportunitySkills = pgTable(
  "opportunity_skills",
  {
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.opportunityId, t.skillId] }), index("opportunity_skills_skill_idx").on(t.skillId)],
);

/* ------------------------------------------------------------------ applications */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    opportunityId: uuid("opportunity_id")
      .notNull()
      .references(() => opportunities.id, { onDelete: "cascade" }),
    status: applicationStatus("status").notNull().default("APPLIED"),
    coverNote: text("cover_note").notNull().default(""),
    matchScoreAtApply: integer("match_score_at_apply").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // a student can apply to an opportunity only once
    uniqueIndex("applications_user_opportunity_unique").on(t.userId, t.opportunityId),
    index("applications_opportunity_idx").on(t.opportunityId),
    index("applications_status_idx").on(t.status),
  ],
);

export const applicationStatusHistory = pgTable(
  "application_status_history",
  {
    id: serial("id").primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => applications.id, { onDelete: "cascade" }),
    fromStatus: applicationStatus("from_status"),
    toStatus: applicationStatus("to_status").notNull(),
    changedById: uuid("changed_by_id").references(() => users.id, { onDelete: "set null" }),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_history_app_idx").on(t.applicationId)],
);

/* ------------------------------------------------------------------ teams */
export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 80 }).notNull(),
    projectTitle: varchar("project_title", { length: 140 }).notNull(),
    description: text("description").notNull().default(""),
    maxSize: integer("max_size").notNull().default(5),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [index("teams_owner_idx").on(t.ownerId)],
);

export const teamRequiredSkills = pgTable(
  "team_required_skills",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    skillId: integer("skill_id")
      .notNull()
      .references(() => skills.id, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.skillId] })],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // optional preferred role area, e.g. "Frontend"; empty = auto-detect from skills
    roleArea: varchar("role_area", { length: 30 }).notNull().default(""),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index("team_members_user_idx").on(t.userId)],
);

export const teamInvitations = pgTable(
  "team_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    inviterId: uuid("inviter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inviteeId: uuid("invitee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: invitationStatus("status").notNull().default("PENDING"),
    message: varchar("message", { length: 300 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
  },
  (t) => [
    // only ONE pending invitation per student per team (prevents duplicate invites)
    uniqueIndex("team_invitation_pending_unique").on(t.teamId, t.inviteeId).where(sql`${t.status} = 'PENDING'`),
    index("team_invitations_invitee_idx").on(t.inviteeId),
  ],
);

/* ------------------------------------------------------------------ notifications */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 40 }).notNull(),
    title: varchar("title", { length: 140 }).notNull(),
    message: text("message").notNull(),
    link: varchar("link", { length: 255 }),
    // prevents duplicate automatic notifications (e.g. one deadline reminder per opportunity)
    dedupeKey: varchar("dedupe_key", { length: 120 }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("notifications_user_idx").on(t.userId, t.createdAt),
    uniqueIndex("notifications_dedupe_unique").on(t.userId, t.dedupeKey),
  ],
);

/* ------------------------------------------------------------------ AI assistant */
export const chatConversations = pgTable(
  "chat_conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 120 }).notNull().default("Career chat"),
    ...timestamps,
  },
  (t) => [index("chat_conversations_user_idx").on(t.userId)],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => chatConversations.id, { onDelete: "cascade" }),
    role: chatRole("role").notNull(),
    content: text("content").notNull(),
    // which engine produced the reply: "anthropic:<model>", "openai:<model>" or "fallback"
    provider: varchar("provider", { length: 80 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

/* ------------------------------------------------------------------ career progress */
export const careerProgress = pgTable(
  "career_progress",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    overallScore: integer("overall_score").notNull(),
    profileScore: integer("profile_score").notNull(),
    skillScore: integer("skill_score").notNull(),
    portfolioScore: integer("portfolio_score").notNull(),
    applicationScore: integer("application_score").notNull(),
    opportunityFitScore: integer("opportunity_fit_score").notNull(),
    aiSummary: text("ai_summary").notNull().default(""),
    aiProvider: varchar("ai_provider", { length: 80 }).notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("career_progress_user_idx").on(t.userId, t.createdAt)],
);

export const careerGoals = pgTable(
  "career_goals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 160 }).notNull(),
    detail: text("detail").notNull().default(""),
    category: varchar("category", { length: 30 }).notNull().default("general"),
    status: goalStatus("status").notNull().default("OPEN"),
    weekStart: date("week_start").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("career_goals_user_week_idx").on(t.userId, t.weekStart)],
);

/* ------------------------------------------------------------------ activity log */
export const activityLogs = pgTable(
  "activity_logs",
  {
    id: serial("id").primaryKey(),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: varchar("action", { length: 60 }).notNull(),
    entityType: varchar("entity_type", { length: 40 }).notNull().default(""),
    entityId: varchar("entity_id", { length: 64 }).notNull().default(""),
    // small structured context only (never passwords or tokens)
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    isAdminAction: boolean("is_admin_action").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("activity_logs_created_idx").on(t.createdAt), index("activity_logs_actor_idx").on(t.actorId)],
);

/* ------------------------------------------------------------------ relations (for relational queries) */
export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(studentProfiles, { fields: [users.id], references: [studentProfiles.userId] }),
  skills: many(studentSkills),
  projects: many(projects),
  achievements: many(achievements),
  certifications: many(certifications),
  applications: many(applications),
}));

export const studentProfilesRelations = relations(studentProfiles, ({ one }) => ({
  user: one(users, { fields: [studentProfiles.userId], references: [users.id] }),
}));

export const studentSkillsRelations = relations(studentSkills, ({ one }) => ({
  user: one(users, { fields: [studentSkills.userId], references: [users.id] }),
  skill: one(skills, { fields: [studentSkills.skillId], references: [skills.id] }),
}));

export const projectsRelations = relations(projects, ({ one }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
}));

export const achievementsRelations = relations(achievements, ({ one }) => ({
  user: one(users, { fields: [achievements.userId], references: [users.id] }),
}));

export const certificationsRelations = relations(certifications, ({ one }) => ({
  user: one(users, { fields: [certifications.userId], references: [users.id] }),
}));

export const opportunitiesRelations = relations(opportunities, ({ many }) => ({
  skills: many(opportunitySkills),
  applications: many(applications),
}));

export const opportunitySkillsRelations = relations(opportunitySkills, ({ one }) => ({
  opportunity: one(opportunities, { fields: [opportunitySkills.opportunityId], references: [opportunities.id] }),
  skill: one(skills, { fields: [opportunitySkills.skillId], references: [skills.id] }),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  user: one(users, { fields: [applications.userId], references: [users.id] }),
  opportunity: one(opportunities, { fields: [applications.opportunityId], references: [opportunities.id] }),
  history: many(applicationStatusHistory),
}));

export const applicationStatusHistoryRelations = relations(applicationStatusHistory, ({ one }) => ({
  application: one(applications, { fields: [applicationStatusHistory.applicationId], references: [applications.id] }),
}));

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, { fields: [teams.ownerId], references: [users.id] }),
  members: many(teamMembers),
  requiredSkills: many(teamRequiredSkills),
  invitations: many(teamInvitations),
}));

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, { fields: [teamMembers.teamId], references: [teams.id] }),
  user: one(users, { fields: [teamMembers.userId], references: [users.id] }),
}));

export const teamRequiredSkillsRelations = relations(teamRequiredSkills, ({ one }) => ({
  team: one(teams, { fields: [teamRequiredSkills.teamId], references: [teams.id] }),
  skill: one(skills, { fields: [teamRequiredSkills.skillId], references: [skills.id] }),
}));

export const teamInvitationsRelations = relations(teamInvitations, ({ one }) => ({
  team: one(teams, { fields: [teamInvitations.teamId], references: [teams.id] }),
}));

export const chatConversationsRelations = relations(chatConversations, ({ many }) => ({
  messages: many(chatMessages),
}));

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  conversation: one(chatConversations, { fields: [chatMessages.conversationId], references: [chatConversations.id] }),
}));

export type ApplicationStatus = (typeof applicationStatus.enumValues)[number];
export type OpportunityType = (typeof opportunityType.enumValues)[number];
export type SkillCategory = (typeof skillCategory.enumValues)[number];
export type UserRole = (typeof userRole.enumValues)[number];

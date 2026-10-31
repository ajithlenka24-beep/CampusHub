/**
 * Development seed data: one admin, eight demo students, opportunities,
 * applications with history, teams, invitations and notifications.
 *
 *   npm run db:seed     (refuses to run when NODE_ENV=production)
 *
 * Demo logins (development only):
 *   Admin:    admin@campushub.dev / Admin@12345
 *   Students: ajith@campushub.dev (and rahul@, arjun@, sneha@, kiran@, priya@, dev@, meera@) / Student@123
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { db, pool } from "./client.js";
import { runMigrations } from "./migrate.js";
import {
  achievements,
  activityLogs,
  applicationStatusHistory,
  applications,
  careerProgress,
  certifications,
  notifications,
  opportunities,
  opportunitySkills,
  projects,
  studentProfiles,
  studentSkills,
  teamInvitations,
  teamMembers,
  teamRequiredSkills,
  teams,
  users,
  type ApplicationStatus,
} from "./schema.js";
import { getOrCreateSkills } from "../services/skills.js";

const DAY = 86_400_000;
const fromNow = (days: number, hour = 23) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 59, 0, 0);
  return d;
};
const ago = (days: number) => new Date(Date.now() - days * DAY);

interface DemoStudent {
  key: string;
  name: string;
  course: string;
  department: string;
  semester: number;
  bio: string;
  skills: [string, number, number][]; // name, proficiency, months of experience
  github?: string;
  linkedin?: string;
}

const STUDENTS: DemoStudent[] = [
  {
    key: "ajith",
    name: "Ajith",
    course: "B.Tech Computer Science & Engineering",
    department: "Computer Science",
    semester: 3,
    bio: "Second-year CSE student who enjoys competitive programming, C++ systems work and building full-stack web apps.",
    skills: [["C++", 90, 24], ["Python", 80, 18], ["JavaScript", 70, 12], ["SQL", 60, 8], ["DSA", 85, 20], ["OOP", 80, 18], ["HTML", 75, 12]],
    github: "https://github.com/ajith-campushub",
  },
  { key: "rahul", name: "Rahul Sharma", course: "B.Tech Computer Science & Engineering", department: "Computer Science", semester: 5, bio: "Frontend developer who loves building fast, accessible React interfaces.", skills: [["React", 85, 18], ["JavaScript", 85, 24], ["HTML", 90, 30], ["CSS", 85, 30], ["TypeScript", 60, 6]] },
  { key: "arjun", name: "Arjun Nair", course: "B.Tech Artificial Intelligence & Data Science", department: "AI & DS", semester: 5, bio: "ML enthusiast working on computer vision and NLP mini-projects.", skills: [["Python", 90, 30], ["Machine Learning", 75, 14], ["TensorFlow", 65, 8], ["Pandas", 80, 12], ["AI", 60, 6]] },
  { key: "sneha", name: "Sneha Reddy", course: "B.Des Interaction Design", department: "Design", semester: 3, bio: "UI/UX designer focused on research-driven, clean product design.", skills: [["Figma", 90, 20], ["UI Design", 85, 18], ["Prototyping", 80, 12], ["User Research", 65, 8]] },
  { key: "kiran", name: "Kiran Patel", course: "B.Tech Information Technology", department: "Information Technology", semester: 5, bio: "Database engineer who enjoys schema design and query optimisation.", skills: [["SQL", 90, 24], ["MySQL", 85, 18], ["MongoDB", 70, 10], ["PostgreSQL", 75, 12]] },
  { key: "priya", name: "Priya Menon", course: "B.Tech Computer Science & Engineering", department: "Computer Science", semester: 5, bio: "Quality engineer: automation testing, API testing and clean bug reports.", skills: [["Selenium", 80, 12], ["Jest", 70, 8], ["Manual Testing", 85, 18], ["Postman", 75, 10], ["Java", 60, 12]] },
  { key: "dev", name: "Dev Malhotra", course: "B.Tech Computer Science & Engineering", department: "Computer Science", semester: 7, bio: "DevOps and cloud enthusiast who automates everything with pipelines.", skills: [["Docker", 85, 14], ["Git", 90, 30], ["AWS", 70, 10], ["Linux", 85, 24], ["CI/CD", 75, 10]] },
  { key: "meera", name: "Meera Iyer", course: "B.Tech Computer Science & Engineering", department: "Computer Science", semester: 7, bio: "Backend developer building REST APIs with Java and Spring Boot.", skills: [["Java", 85, 24], ["Spring Boot", 75, 12], ["SQL", 75, 18], ["Git", 80, 20], ["REST API", 80, 14]] },
];

const OPPORTUNITIES = [
  { key: "cpp", title: "C++ Developer Internship", organization: "TechNova", type: "INTERNSHIP", workMode: "HYBRID", location: "Bengaluru", deadline: fromNow(15), skills: ["C++", "DSA", "OOP", "Git"], eligibility: "B.Tech/B.E. students in semester 3 or above with strong C++ fundamentals.", description: "Join TechNova's systems team for a 3-month internship building high-performance C++ services. You will optimise data structures, write unit-tested modules and take part in code reviews with senior engineers." },
  { key: "aiml", title: "AI/ML Hackathon", organization: "Campus AI Club", type: "HACKATHON", workMode: "ONSITE", location: "Main Auditorium", deadline: fromNow(20), skills: ["Python", "Machine Learning", "AI"], eligibility: "Open to all students. Teams of 3 to 5.", description: "A 36-hour hackathon to build AI-powered solutions for real campus problems. Mentors, datasets and cloud credits are provided." },
  { key: "fullstack", title: "Full Stack Web Workshop", organization: "Tech Community", type: "WORKSHOP", workMode: "ONSITE", location: "Lab 4, CS Block", deadline: fromNow(31), skills: ["HTML", "CSS", "JavaScript"], eligibility: "Beginners welcome. Bring a laptop.", description: "A hands-on weekend workshop covering responsive layouts, modern JavaScript and connecting a frontend to a REST API." },
  { key: "webdev", title: "Web Development Internship", organization: "CreativeTech", type: "INTERNSHIP", workMode: "REMOTE", location: "Remote", deadline: fromNow(12), skills: ["HTML", "CSS", "JavaScript", "React"], eligibility: "Students with at least one web project in their portfolio.", description: "Work with CreativeTech's product team to build responsive client websites and reusable React components." },
  { key: "cloud", title: "Cloud Workshop", organization: "CloudTech Community", type: "WORKSHOP", workMode: "ONSITE", location: "Seminar Hall 2", deadline: fromNow(-10), skills: ["Linux", "Python", "Cloud Computing"], eligibility: "Open to all students.", description: "An introductory workshop on cloud fundamentals: virtual machines, storage, deployment and basic Linux administration." },
  { key: "contest", title: "Competitive Coding Contest", organization: "CodeCraft Society", type: "COMPETITION", workMode: "ONSITE", location: "CS Labs", deadline: fromNow(-2), skills: ["C++", "DSA", "Problem Solving"], eligibility: "Individual participation.", description: "A timed inter-college contest with algorithmic problems of increasing difficulty. Registration for this round has closed." },
  { key: "research", title: "Undergraduate Research Assistant: Graph Algorithms", organization: "Department of Computer Science", type: "RESEARCH", workMode: "HYBRID", location: "Algorithms Lab", deadline: fromNow(2), skills: ["C++", "DSA", "Python"], eligibility: "Semester 3+ with a CGPA of 7.5 or above.", description: "Assist a faculty-led research project on scalable graph algorithms: implement algorithms, run experiments and help write up results." },
  { key: "techfest", title: "TechFest Volunteer Team", organization: "Student Council", type: "CAMPUS_EVENT", workMode: "ONSITE", location: "Campus", deadline: fromNow(9), skills: ["Communication", "Teamwork"], eligibility: "All students.", description: "Help organise CampusHub TechFest: coordinate events, guide speakers and run registration desks." },
  { key: "oss", title: "Open Source Campus Portal Project", organization: "Developer Student Club", type: "PROJECT", workMode: "REMOTE", location: "Remote", deadline: fromNow(25), skills: ["JavaScript", "Node.js", "Git", "SQL"], eligibility: "Students comfortable with Git and JavaScript.", description: "Contribute to an open-source campus portal: build API endpoints, write tests and review pull requests with peers." },
  { key: "draft", title: "Data Analyst Internship (Draft)", organization: "InsightWorks", type: "INTERNSHIP", workMode: "REMOTE", location: "Remote", deadline: fromNow(40), skills: ["Python", "SQL", "Pandas"], eligibility: "Draft posting.", description: "Draft listing not yet published: analyse business data and build dashboards with Python and SQL.", isPublished: false },
] as const;

async function seed() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed a production database.");
  await runMigrations();

  console.log("Clearing existing data…");
  await db.execute(sql`TRUNCATE users, skills, opportunities, activity_logs RESTART IDENTITY CASCADE`);

  const studentHash = await bcrypt.hash("Student@123", 12);
  const adminHash = await bcrypt.hash("Admin@12345", 12);

  const [admin] = await db
    .insert(users)
    .values({ email: "admin@campushub.dev", fullName: "Placement Cell Admin", passwordHash: adminHash, role: "ADMIN", onboardingCompleted: true, emailVerifiedAt: new Date() })
    .returning();
  await db.insert(studentProfiles).values({ userId: admin.id, college: "CampusHub University" });

  const ids: Record<string, string> = {};
  for (const s of STUDENTS) {
    const [u] = await db
      .insert(users)
      .values({ email: `${s.key}@campushub.dev`, fullName: s.name, passwordHash: studentHash, onboardingCompleted: true, emailVerifiedAt: new Date(), lastLoginAt: ago(1) })
      .returning();
    ids[s.key] = u.id;
    await db.insert(studentProfiles).values({
      userId: u.id,
      college: "CampusHub University",
      course: s.course,
      department: s.department,
      semester: s.semester,
      bio: s.bio,
      githubUrl: s.github ?? null,
      linkedinUrl: s.linkedin ?? null,
    });
    const refs = await getOrCreateSkills(db, s.skills.map(([name]) => name));
    await db.insert(studentSkills).values(refs.map((r, i) => ({ userId: u.id, skillId: r.id, proficiency: s.skills[i][1], experienceMonths: s.skills[i][2] })));
  }

  const ajith = ids.ajith;
  await db.insert(projects).values([
    { userId: ajith, title: "CampusHub", description: "A full-stack student career and collaboration platform with skill matching and team analysis.", technologies: ["React", "TypeScript", "Node.js", "PostgreSQL"], githubUrl: "https://github.com/ajith-campushub/campushub" },
    { userId: ajith, title: "Student Management System", description: "A C++ console application that manages student records using file handling and OOP.", technologies: ["C++", "OOP"] },
    { userId: ajith, title: "DSA Algorithm Visualizer", description: "Interactive visualisations of sorting and graph algorithms built with JavaScript and Canvas.", technologies: ["JavaScript", "HTML", "DSA"] },
  ]);
  await db.insert(achievements).values([
    { userId: ajith, title: "DSA Lab Achievement", description: "Top score in the semester DSA lab examination.", achievedOn: "2026-05-20" },
    { userId: ajith, title: "Hackathon Participant", description: "Built a campus lost-and-found app in 24 hours.", achievedOn: "2026-03-14" },
  ]);
  await db.insert(certifications).values([
    { userId: ajith, name: "Python Programming Certificate", issuer: "College Training & Placement Cell", issueDate: "2026-02-10" },
    { userId: ajith, name: "Database Fundamentals", issuer: "Online course", issueDate: "2026-06-01" },
  ]);

  const oppIds: Record<string, string> = {};
  for (const o of OPPORTUNITIES) {
    const [created] = await db
      .insert(opportunities)
      .values({
        title: o.title,
        organization: o.organization,
        description: o.description,
        type: o.type,
        workMode: o.workMode,
        location: o.location,
        eligibility: o.eligibility,
        deadline: o.deadline,
        isPublished: "isPublished" in o ? o.isPublished : true,
        createdById: admin.id,
        createdAt: ago(20 - Object.keys(oppIds).length),
      })
      .returning();
    oppIds[o.key] = created.id;
    const refs = await getOrCreateSkills(db, [...o.skills]);
    await db.insert(opportunitySkills).values(refs.map((r) => ({ opportunityId: created.id, skillId: r.id })));
  }

  // Ajith's applications, each with a realistic status history
  const timeline: [string, ApplicationStatus[], number][] = [
    ["aiml", ["APPLIED", "SHORTLISTED"], 5],
    ["webdev", ["APPLIED", "SHORTLISTED", "INTERVIEW"], 9],
    ["cloud", ["APPLIED", "SHORTLISTED", "SELECTED"], 20],
  ];
  for (const [key, steps, daysAgo] of timeline) {
    const [app] = await db
      .insert(applications)
      .values({ userId: ajith, opportunityId: oppIds[key], status: steps[steps.length - 1], matchScoreAtApply: 50, createdAt: ago(daysAgo) })
      .returning();
    let previous: ApplicationStatus | null = null;
    for (const [i, step] of steps.entries()) {
      await db.insert(applicationStatusHistory).values({
        applicationId: app.id,
        fromStatus: previous,
        toStatus: step,
        changedById: i === 0 ? ajith : admin.id,
        note: i === 0 ? "Application submitted" : "",
        createdAt: ago(daysAgo - i * 2),
      });
      previous = step;
    }
  }
  await db.insert(applications).values({ userId: ids.rahul, opportunityId: oppIds.webdev, status: "APPLIED", matchScoreAtApply: 100, createdAt: ago(3) });

  // Team Phoenix (owned by Ajith) and a team that invites Ajith
  const [phoenix] = await db
    .insert(teams)
    .values({ name: "Team Phoenix", projectTitle: "Smart Campus Navigator", description: "An app that helps students find classrooms, events and study spaces in real time.", maxSize: 7, ownerId: ajith })
    .returning();
  await db.insert(teamMembers).values(["ajith", "rahul", "arjun", "sneha", "kiran"].map((k, i) => ({ teamId: phoenix.id, userId: ids[k], joinedAt: ago(10 - i) })));
  const phoenixSkills = await getOrCreateSkills(db, ["React", "Node.js", "SQL", "Machine Learning", "Figma", "Git"]);
  await db.insert(teamRequiredSkills).values(phoenixSkills.map((s) => ({ teamId: phoenix.id, skillId: s.id })));

  const [cloudCrew] = await db
    .insert(teams)
    .values({ name: "Cloud Crew", projectTitle: "Campus Event Ticketing Platform", description: "A scalable ticketing platform for college fests, deployed on the cloud.", maxSize: 5, ownerId: ids.meera })
    .returning();
  await db.insert(teamMembers).values([{ teamId: cloudCrew.id, userId: ids.meera }, { teamId: cloudCrew.id, userId: ids.dev }]);
  const crewSkills = await getOrCreateSkills(db, ["Java", "Spring Boot", "Docker", "React", "C++"]);
  await db.insert(teamRequiredSkills).values(crewSkills.map((s) => ({ teamId: cloudCrew.id, skillId: s.id })));
  await db.insert(teamInvitations).values({ teamId: cloudCrew.id, inviterId: ids.meera, inviteeId: ajith, message: "We need someone strong in C++ and DSA for our booking engine!" });

  await db.insert(notifications).values([
    { userId: ajith, type: "TEAM_INVITE", title: "Team invitation", message: "Meera Iyer invited you to join Cloud Crew (Campus Event Ticketing Platform).", link: "/teams", createdAt: ago(0.05) },
    { userId: ajith, type: "APPLICATION_STATUS", title: "Application shortlisted", message: "Good news! Your application for AI/ML Hackathon was shortlisted.", link: "/applications", createdAt: ago(1) },
    { userId: ajith, type: "APPLICATION_STATUS", title: "Interview scheduled", message: "An interview has been scheduled for your Web Development Internship application.", link: "/applications", createdAt: ago(3) },
    { userId: ajith, type: "APPLICATION_STATUS", title: "You were selected", message: "Congratulations! You were selected for Cloud Workshop.", link: "/applications", readAt: ago(5), createdAt: ago(6) },
    { userId: ajith, type: "SYSTEM", title: "Welcome to CampusHub", message: "Complete your profile to unlock skill-matched opportunities and Group Up.", link: "/profile", readAt: ago(20), createdAt: ago(21), dedupeKey: "welcome" },
  ]);

  // a few earlier progress snapshots so the career chart has history
  for (const [days, overall, skill, profile, portfolio] of [[28, 41, 70, 55, 30], [21, 47, 73, 60, 45], [14, 52, 76, 65, 52], [7, 56, 77, 70, 60]] as const) {
    await db.insert(careerProgress).values({ userId: ajith, overallScore: overall, skillScore: skill, profileScore: profile, portfolioScore: portfolio, applicationScore: 40, opportunityFitScore: 50, aiSummary: "", aiProvider: "seed", createdAt: ago(days) });
  }

  await db.insert(activityLogs).values([
    { actorId: admin.id, action: "OPPORTUNITY_CREATED", entityType: "opportunity", details: { title: "C++ Developer Internship" }, isAdminAction: true, createdAt: ago(18) },
    { actorId: ajith, action: "APPLICATION_SUBMITTED", entityType: "application", details: { opportunity: "AI/ML Hackathon" }, createdAt: ago(5) },
    { actorId: admin.id, action: "APPLICATION_STATUS_CHANGED", entityType: "application", details: { from: "APPLIED", to: "SHORTLISTED", opportunity: "AI/ML Hackathon" }, isAdminAction: true, createdAt: ago(1) },
    { actorId: ajith, action: "TEAM_CREATED", entityType: "team", details: { name: "Team Phoenix" }, createdAt: ago(10) },
  ]);

  console.log("\nSeed complete. Demo logins (development only):");
  console.log("  Admin:    admin@campushub.dev / Admin@12345");
  console.log("  Students: ajith@campushub.dev, rahul@…, arjun@…, sneha@…, kiran@…, priya@…, dev@…, meera@… / Student@123\n");
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isDirectRun) {
  seed()
    .catch((error) => {
      console.error("Seeding failed:", error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}

export { seed };

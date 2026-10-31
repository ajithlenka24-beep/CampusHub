# CampusHub

**Student Skill, Opportunity & Team Collaboration Platform**: a full-stack web application where students build professional profiles, discover skill-matched opportunities, track applications, form balanced project teams and get AI-assisted career guidance.

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · React Router 7 · hand-written CSS (original CampusHub black-and-gold design) |
| Backend | Node.js · Express 5 · TypeScript · Zod validation |
| Database | PostgreSQL 16 · Drizzle ORM · versioned SQL migrations |
| Auth | bcrypt (12 rounds) · server-side sessions in HTTP-only cookies · CSRF tokens · rate limiting · role-based access |
| AI | Anthropic or OpenAI-compatible API through the backend (keys never reach the browser), with a clearly labelled rule-based fallback |
| Tests | Vitest + Supertest against a real PostgreSQL test database · Playwright end-to-end script |

---

## 1. Quick start

**Requirements:** Node.js **22.12 or newer**, and PostgreSQL **14 or newer** (installed locally, or via Docker).

```bash
# 1. Install dependencies (frontend + backend, one command)
npm install

# 2. Create the database user and databases (choose ONE option)
#    a) Local PostgreSQL:
psql -U postgres -f scripts/setup-database.sql
#    b) Docker:
docker compose up -d

# 3. Configure environment variables
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
cp .env.test.example .env.test    # only needed for `npm test`

# 4. Create the tables and load demo data
npm run db:migrate
npm run db:seed

# 5. Start the API (http://localhost:4000) and the website (http://localhost:5173)
npm run dev
```

Open **http://localhost:5173**. You'll see the login page first. Screenshots of every main screen are in [`docs/screenshots/`](docs/screenshots).

### Demo accounts (created by `npm run db:seed`, development only)

| Role | Email | Password |
|---|---|---|
| Student (rich demo profile) | `ajith@campushub.dev` | `Student@123` |
| Other students | `rahul@`, `arjun@`, `sneha@`, `kiran@`, `priya@`, `dev@`, `meera@campushub.dev` | `Student@123` |
| Administrator | `admin@campushub.dev` | `Admin@12345` |

`npm run db:seed` **erases all data** and reloads the demo. It refuses to run when `NODE_ENV=production`.

---

## 2. Project structure

```
campushub/
├── backend/
│   ├── drizzle/                 # versioned SQL migrations (generated from the schema)
│   ├── src/
│   │   ├── config/env.ts        # validated environment variables
│   │   ├── db/                  # schema.ts (24 tables), client, migrate, seed, reset
│   │   ├── middleware/          # auth (sessions, roles), CSRF, validation, rate limits, uploads, errors
│   │   ├── routes/              # REST endpoints: auth, profile, opportunities, applications, teams,
│   │   │                        # notifications, dashboard, career, assistant, admin, directory
│   │   ├── services/            # business logic: engines (matching, completion, teams), career tracker,
│   │   │                        # AI provider + assistant, alerts, notifications, mail, sessions
│   │   ├── validators/          # shared zod rules (passwords, URLs, dates…)
│   │   ├── scripts/createAdmin.ts
│   │   ├── app.ts / server.ts
│   └── tests/                   # 59 automated API, security and engine tests
├── frontend/
│   └── src/
│       ├── pages/               # auth pages, onboarding, dashboard, profile, opportunities, applications,
│       │                        # Group Up, career tracker, assistant, admin/*
│       ├── components/          # modal, toasts, notification bell, chat, tag input, letter-hover heading…
│       ├── layouts/ · routes/ · context/ · hooks/ · services/api.ts · styles/ · utils/
├── e2e/run-e2e.mjs              # Playwright end-to-end workflow test
├── legacy/                      # the original static prototype (for reference)
├── scripts/                     # SQL helpers for creating the database
├── docker-compose.yml           # optional PostgreSQL container
└── .env.example
```

Routes keep request handling thin; reusable logic lives in `services/`. The three scoring engines in `backend/src/services/engines.ts` are **pure functions** with no database access, so every number in the UI can be reproduced by hand.

---

## 3. Features

### Authentication & security
- Registration (full name, college email, password + confirmation, college, course, semester, terms), login with show/hide password and **Remember me**, logout, forgot/reset password, optional email verification, change password.
- **Flow:** Register → (verify email, if enabled) → Login → **mandatory onboarding** (academic details, introduction, at least 3 skills) → Dashboard. Visitors who aren't logged in only see the auth pages. Students who haven't onboarded are always sent to onboarding, by the frontend guards **and** by the API (`403 ONBOARDING_REQUIRED`).
- Passwords hashed with bcrypt. Sessions are random tokens in an **HTTP-only, SameSite=Lax** cookie; only their SHA-256 hash is stored, so they can be revoked (logout, password reset, account deactivation).
- **CSRF**: double-submit token on every state-changing request. **Rate limits** on login/registration/password reset, the AI endpoints and the API overall.
- **Authorization** on every endpoint: students can only read or modify their own records (other students' IDs return 404), and admin routes check the role stored in the database (`403 ROLE_REQUIRED`). Students can't set their own application status beyond withdrawing.
- Zod validation on all input. Parameterised SQL via Drizzle (no string-built queries). React escapes output, and links accept only `http(s)` URLs. Image uploads are checked by size, MIME type **and file signature** (magic bytes). Security headers come from Helmet, with a CSP. Errors are logged on the server, and users see a generic message.

### Student features
- **Dashboard**: welcome, profile picture, completion %, skill/project/application/certification counts, recommended opportunities, recent application activity, career readiness, recommendations, skill progress, upcoming deadlines and notifications. Everything is computed from the logged-in student's records.
- **Profile**: personal info, avatar upload, skills (category, proficiency, experience), projects (technologies, GitHub/live links, screenshot), achievements, certifications and social links, with full add/edit/delete. Completion recalculates live with recommendations.
- **Opportunities**: search, filter by category, skill, deadline and work mode, sort by best match, newest or deadline; detail page with matched/missing skills and recommended skills to learn; apply with a cover note; duplicate and late applications are blocked.
- **Application tracker**: stages Applied → Shortlisted → Interview → Selected / Rejected (plus Withdrawn), with a timestamped status history and notifications for every change.
- **Group Up**: create teams (project, description, required skills, max size 2–10), invite students, accept/decline invitations, leave (ownership transfers), remove members, choose your team role. Includes **teammate suggestions ranked by the gaps they fill**, skill-area coverage, required-skill coverage, missing roles, readiness and recommendations. Duplicate invitations and team-size limits are enforced in the database and the API.
- **AI career progress tracker**: measured scores with visible formulas, a progress history chart, recommended and missing skills, **weekly goals** you can tick off, and AI-written (or rule-based) recommendations, clearly labelled.
- **CampusHub AI Assistant**: chat page plus a floating widget, with persistent history, a loading indicator, clear chat, error handling and suggested prompts.
- **Notifications**: stored in the database, with badge, panel, read/unread state, mark one or mark all as read, and links. Triggers: application submitted or status changed, new strong skill match, approaching deadline, team invite, invitation accepted or declined, team changes.

### Administrator features
- Overview (student, opportunity, application and team totals; applications by status; recent activity).
- Opportunities: create, edit, delete, publish/unpublish, and view applicants with their match %. Publishing notifies strongly matching students.
- Applications: filter, review, change status with a note (history and notification are recorded automatically).
- Students: search, view details, deactivate/reactivate (deactivating logs the student out immediately).
- Teams: list with coverage and readiness, remove a team. **Activity log** of platform and admin actions.

---

## 4. How the scores are calculated

All of these are deterministic and shown in the UI with their formulas.

| Score | Formula |
|---|---|
| **Skill match** | matched required skills ÷ required skills × 100. Names are normalised ("JS" = "JavaScript", "ML" = "Machine Learning"). *Example:* student has C++, Python, DSA, OOP, SQL; the role needs C++, DSA, OOP, Git → 3 ÷ 4 = **75%**, missing Git. |
| **Profile completion** | Fixed points per section, total 100: basics 10, semester 5, introduction 10, picture 5, ≥3 skills 20, ≥1 project 20, achievement 5, certification 5, GitHub 10, LinkedIn 10. |
| **Team skill-area coverage** | areas with at least one team skill ÷ 7 × 100. The areas are Frontend, Backend, Database, AI/ML, UI/UX, Testing and DevOps. |
| **Required-skill coverage** | the team's required skills that some member has ÷ required skills × 100. |
| **Team readiness** | 40% coverage + 20% team size (members ÷ 5, capped) + 20% role diversity (distinct roles ÷ members) + 20% critical roles (Frontend, Backend and Database owners ÷ 3). A team with a missing critical role is never labelled "Hackathon Ready". |
| **Member role** | The area most of a member's skills belong to. Ties go to the more specialised area. Members can override it. |
| **Career readiness indicator** | 25% profile completion + 25% skill strength (average proficiency) + 20% portfolio (projects, certifications and achievements, each capped) + 15% opportunity fit (average match of your top 5 open opportunities) + 15% applications. It is **a progress indicator, not a hiring prediction**. |

**Measured vs generated:** the numbers above are always calculated from the database. Only the written recommendations come from the AI, and the AI receives just the measured data, with instructions not to invent skills, certifications or activities.

---

## 5. Configuring the AI provider

The AI key lives **only** in the backend `.env`. The browser talks to `/api/assistant` and `/api/career`, never to the AI provider.

```bash
# Anthropic
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=<an Anthropic model ID available on your account>

# OpenAI
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=<an OpenAI model ID available on your account>

# Any OpenAI-compatible server (e.g. Ollama running locally)
AI_PROVIDER=openai
AI_BASE_URL=http://localhost:11434/v1
AI_API_KEY=ollama
AI_MODEL=llama3.1
```

Restart the backend after changing `.env`. The assistant header then shows the provider and model.

- **Without a key** (`AI_PROVIDER=none`): the assistant runs as a labelled **Basic assistant**. It answers common questions (matching internships, next skill to learn, profile gaps, application status, team gaps, how matching works) from the student's data, using rules. The career page labels its recommendations **Rule-based**.
- **If the AI call fails** (wrong key, timeout): the student still gets a basic answer, plus a visible notice that the AI provider didn't respond.

---

## 6. Creating an administrator

```bash
npm run create-admin -- --email placement@college.edu --name "Placement Cell" --password "Str0ngPassw0rd"
```

If you leave out `--password`, a strong random one is generated and printed once. Running the command with an existing email promotes that account to admin and resets its password. Admins only use the admin area; they can't apply to opportunities or join teams.

---

## 7. Email

When `SMTP_HOST` is empty (the default), password-reset and verification emails are **printed in the backend terminal**, so you can copy the link during development. To send real emails, fill in the `SMTP_*` variables (any SMTP provider). Set `EMAIL_VERIFICATION_REQUIRED=true` to require email verification before login. `ALLOWED_EMAIL_DOMAINS=college.edu` restricts registration to college emails.

---

## 8. Database

- The schema lives in `backend/src/db/schema.ts`: users, sessions, verification and reset tokens, student profiles, a shared skills catalogue, student skills, projects, achievements, certifications, opportunities and their skills, applications with status history, teams with required skills, members and invitations, notifications, chat conversations and messages, career progress and weekly goals, and activity logs.
- Foreign keys use explicit delete behaviour (cascade for owned data, restrict for catalogue skills, set-null for audit references). Unique constraints prevent duplicate emails, duplicate applications, duplicate skills per student and **duplicate pending invitations** (a partial unique index).
- To change the schema: edit `schema.ts` → `npm run db:generate` (creates a new SQL file in `backend/drizzle/`) → `npm run db:migrate`. The server also applies pending migrations automatically on start.
- `npm run db:reset` drops and recreates everything, then seeds (development only). `npm run db:studio` opens Drizzle Studio to browse the data.

> **Why Drizzle instead of Prisma?** Prisma needs to download native engine binaries from `binaries.prisma.sh`, and that host was blocked in the environment where this project was built and tested. Drizzle is a type-safe TypeScript ORM that installs entirely from npm and produces plain, readable SQL migrations, so every migration and database test could actually be run. The relational design is the same as a Prisma schema would express.

---

## 9. Testing

```bash
npm test          # 59 backend tests against the campushub_test database (it is wiped on every run)
```

They cover:
- auth: registration validation, duplicate email, wrong password, HTTP-only cookie, logout, expired session, CSRF, rate limiting, password reset and verification
- RBAC and ownership: a student editing or deleting another student's data, and students calling admin APIs
- onboarding gate, profile CRUD and completion, image-upload validation
- matching (including recalculation when skills or requirements change), search and filters
- applications: duplicates, deadlines, unpublished opportunities, admin-only status changes with history and notifications, withdrawal
- teams: invitations, duplicate invites, size limits, decline and leave, ownership transfer
- AI: fallback answers, data isolation, and the Anthropic and OpenAI adapters with a mocked network
- career metrics, notifications and admin management

**End-to-end** (real browser through the whole workflow):

```bash
npm i -D playwright && npx playwright install chromium   # one-time
npm run db:seed
# start the API with rate limiting off (the test logs in many times), plus the frontend:
RATE_LIMIT_ENABLED=false npm run dev                     # PowerShell: $env:RATE_LIMIT_ENABLED="false"; npm run dev
npm run test:e2e                                         # screenshots go to e2e/screenshots/
```

---

## 10. Production build

```bash
npm run build                         # compiles the backend (dist/) and the frontend (frontend/dist)
# in .env: NODE_ENV=production, SERVE_FRONTEND=true, APP_URL / CORS_ORIGINS = your public URL,
#          COOKIE_SECURE=true when served over HTTPS, TRUST_PROXY=true behind a proxy, SMTP_* for email
npm start                             # one server: API + website on PORT
```

---

## 11. Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) + Vite dev server |
| `npm run db:migrate` | apply pending migrations |
| `npm run db:seed` | wipe and load demo data (dev only) |
| `npm run db:reset` | drop everything, migrate, seed (dev only) |
| `npm run db:generate` | create a migration after editing `schema.ts` |
| `npm run create-admin -- --email …` | create or promote an administrator |
| `npm test` | backend test suite |
| `npm run test:e2e` | Playwright workflow test |
| `npm run build` / `npm start` | production build / run |

# CampusHub

**Student Skill, Opportunity & Team Collaboration Platform**: a full-stack, multi-user web application where students build professional profiles, discover skill-matched opportunities, track applications, form balanced project teams and get AI-assisted career guidance.

Anyone you give the website URL to can create their **own account**. Every student's profile, skills, projects, applications, notifications, career data and team memberships are private to them; only opportunities and other admin-published content are shared.

| Layer | Technology |
|---|---|
| Frontend | React 19 · TypeScript · Vite · React Router 7 · hand-written CSS (original CampusHub black-and-gold design) |
| Backend | Node.js · Express 5 · TypeScript · Zod validation |
| Database | PostgreSQL 16 · Drizzle ORM · versioned SQL migrations |
| Auth | bcrypt (12 rounds) · server-side sessions in HTTP-only cookies · CSRF tokens · per-account rate limiting · role-based access |
| AI | Anthropic or OpenAI-compatible API through the backend (keys never reach the browser), with a clearly labelled rule-based fallback |
| Tests | Vitest + Supertest against a real PostgreSQL test database · Playwright end-to-end scripts (single user and two-person) |

---

## 1. Quick start (local)

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

# 4. Create the tables, then (optionally) load demo data
npm run db:migrate
npm run db:seed                   # demo students, opportunities and teams (development only)

# 5. Start the API (http://localhost:4000) and the website (http://localhost:5173)
npm run dev
```

Open **http://localhost:5173**. You'll see the login page first; **Create a student account** to start as a brand-new user, or use a demo account. Screenshots of the main screens are in [`docs/screenshots/`](docs/screenshots).

### Demo accounts (created by `npm run db:seed`, development only)

| Role | Email | Password |
|---|---|---|
| Student (rich demo profile) | `ajith@campushub.dev` | `Student@123` |
| Other students | `rahul@`, `arjun@`, `sneha@`, `kiran@`, `priya@`, `dev@`, `meera@campushub.dev` | `Student@123` |
| Administrator | `admin@campushub.dev` | `Admin@12345` |

`npm run db:seed` **erases all data** and reloads the demo. It refuses to run when `NODE_ENV=production`, and it also refuses when the database contains **real accounts** (any email outside `@campushub.dev`), so classmates' accounts can't be wiped by accident. Use a separate development database, or `npm run db:seed -- --force` if you really mean it (PowerShell: `$env:SEED_FORCE="true"; npm run db:seed`). The app never depends on the demo accounts: everything works with accounts people create themselves.

---

## 2. Project structure

```
campushub/
├── backend/
│   ├── drizzle/                 # versioned SQL migrations (0000_init, 0001_multi_user_privacy)
│   ├── src/
│   │   ├── config/env.ts        # validated environment variables
│   │   ├── db/                  # schema.ts (24 tables), client, migrate, seed, reset
│   │   ├── middleware/          # auth (sessions, roles, account guard), CSRF, validation, rate limits, uploads, errors
│   │   ├── routes/              # REST endpoints: auth, profile, opportunities, applications, teams,
│   │   │                        # notifications, dashboard, career, assistant, admin, directory
│   │   ├── services/            # business logic: engines (matching, completion, teams), career tracker,
│   │   │                        # AI provider + assistant, alerts, notifications, mail, sessions, startup checks
│   │   ├── validators/          # shared zod rules (passwords, URLs, dates…)
│   │   ├── scripts/createAdmin.ts
│   │   ├── app.ts / server.ts
│   └── tests/                   # 81 automated API, security, multi-user and engine tests
├── frontend/
│   └── src/
│       ├── pages/               # auth pages, onboarding wizard, dashboard, profile, opportunities, applications,
│       │                        # Group Up, career tracker, assistant, admin/*
│       ├── components/          # modal, toasts, notification bell, chat, tag input, letter-hover heading…
│       ├── layouts/ · routes/ · context/ · hooks/ · services/api.ts · styles/ · utils/
├── e2e/run-e2e.mjs              # Playwright: full single-student workflow + admin
├── e2e/run-multiuser-e2e.mjs    # Playwright: two people, separate browsers, shared computer, account switching
├── render.yaml                  # one-click Render deployment (web service + PostgreSQL)
├── legacy/                      # the original static prototype (for reference)
├── scripts/                     # SQL helpers for creating the database
├── docker-compose.yml           # optional PostgreSQL container
└── .env.example
```

Routes keep request handling thin; reusable logic lives in `services/`. The three scoring engines in `backend/src/services/engines.ts` are **pure functions** with no database access, so every number in the UI can be reproduced by hand.

---

## 3. Accounts, privacy and multi-user isolation

### What is private and what is shared

| Data | Who can see it |
|---|---|
| Profile details (bio, department, links), email | only the student (and administrators) |
| Skills | the student; teammates in the same team; other students **only if** the student turns on *Show me in teammate search* |
| Projects, achievements, certifications | only the student (and administrators) |
| Applications and their status history | only the student (and administrators, who manage statuses) |
| Notifications, AI chat history, career progress and weekly goals | only the student |
| Team membership | the team's members (and anyone the owner invites can preview the team before accepting) |
| Opportunities | everyone who is logged in (published by administrators) |

### How isolation is enforced (backend, not just the UI)

- **Identity comes from the session only.** The browser holds a random session token in an HTTP-only cookie; the server looks up the user from the hashed token on every request. No endpoint accepts a user id, owner id or email from the browser to decide whose data to read or change. A `userId` sent in a request body is ignored.
- **Every query on private data is scoped by the logged-in user's id.** Asking for another student's project, achievement, certification, skill, application, notification, career goal or team returns **404**, so ids can't be probed. Administrator endpoints check the role stored in the database (`403 ROLE_REQUIRED`).
- **There is no endpoint that returns another student's full profile.** The teammate directory returns a minimal card (name, course, college, semester, picture, skills) and only for students who opted in. Skill autocomplete never reveals a skill name that only one other person has typed.
- **Uploaded images require a login.** Profile pictures can be seen by logged-in users (they appear on team cards); project screenshots only by their owner and administrators.
- **API responses are sent with `Cache-Control: no-store`**, so a shared computer's browser cache never holds someone else's data.
- **Database:** every private table has a `user_id` foreign key to `users` (cascade on delete), and unique constraints stop duplicate emails, duplicate applications, duplicate skills and duplicate pending invitations.

### Shared computers and switching accounts

- Logging in on a browser that is still signed in ends the previous session in the database; logging in and out both rotate the CSRF token.
- The frontend rebuilds its whole page tree when the signed-in account changes (login, logout, or a switch in another tab), so no page, form, chat or notification list from the previous person survives.
- Open tabs stay in sync: logging out or in as someone else in one tab switches the other tabs too (BroadcastChannel, plus a check when a tab regains focus). Each API request also carries the id of the account the tab is showing (`X-CampusHub-User`); if the session now belongs to someone else, the server refuses with `409 ACCOUNT_CHANGED` and the tab reloads as the current account, so a stale tab can never save A's form into B's account. The server only compares this header with the session; it is never trusted as an identity.
- After login, students are returned only to general pages (never to a specific team page that may have belonged to the previous person on that computer).

---

## 4. Features

### Registration, login and onboarding
- Registration (full name, email, password + confirmation, college, course, semester, terms), login with show/hide password and **Remember me**, logout, forgot/reset password, optional email verification, change password. Passwords need 8+ characters with upper- and lower-case letters and a number (and at most 72 bytes, bcrypt's limit). Duplicate emails are rejected (case-insensitive).
- **New-student onboarding**, one step at a time, each saved as you continue: **Basic information** (required: name, college, course, semester; optional: department, introduction) → **Skills** (at least one, required) → **Projects** (optional) → **Achievements & certifications** (optional) → **Social links** (optional) → **Profile completion** (shows what's missing and asks whether to appear in teammate search) → Dashboard. Required and optional steps are labelled; optional steps have *Skip for now*.
- Students who haven't finished onboarding are sent back to it, by the frontend guards **and** by the API (`403 ONBOARDING_REQUIRED`). Returning students log straight into their own dashboard.

### Student features
- **Dashboard**: welcome, completion %, skill/project/application/certification counts, recommended opportunities, recent application activity, career readiness, recommendations, skill progress, upcoming deadlines. Everything is computed from the logged-in student's records, and new accounts see friendly empty states ("No applications yet → Explore opportunities").
- **Profile**: personal info, avatar upload, skills (category, proficiency, experience), projects (technologies, GitHub/live links, screenshot), achievements, certifications and social links, with full add/edit/delete, live completion, and a **Privacy** card for teammate-search visibility.
- **Opportunities**: search, filter by category, skill, deadline and work mode, sort by best match, newest or deadline; detail page with matched/missing skills and recommended skills to learn; apply with a cover note; duplicate and late applications are blocked.
- **Application tracker**: Applied → Shortlisted → Interview → Selected / Rejected (plus Withdrawn), with a timestamped history and a notification for every change.
- **Group Up**: create teams (project, description, required skills, max size 2–10), **invite classmates by email** or pick from suggested students who opted in, accept/decline invitations, leave (ownership transfers), remove members, choose your team role. The analysis (skill-area coverage, required-skill coverage, missing roles, readiness, recommendations and a combined **Team skills** view) always uses each member's **real, current skills** read live from their own profile; nothing is copied. Team-size limits hold even when several people accept at the same moment (row locks).
- **AI career progress tracker**: measured scores with visible formulas, progress history, recommended and missing skills, weekly goals, and AI-written (or rule-based) recommendations, clearly labelled.
- **CampusHub AI Assistant**: chat page plus a floating widget, with persistent per-student history. The model only ever receives the logged-in student's own data.
- **Notifications**: badge, panel, read/unread, mark one or all as read ("You're all caught up"), links. Triggers: application submitted or status changed, new strong skill match, approaching deadline, team invite, invitation accepted or declined, team changes.

### Administrator features
- Overview (student, opportunity, application and team totals; applications by status; recent activity).
- Opportunities: create, edit, delete, publish/unpublish, view applicants with their match %. Publishing notifies strongly matching students.
- Applications: every student's applications, filter, review, change status with a note (history and notification are recorded automatically).
- Students: search, view details, deactivate/reactivate (deactivating logs the student out immediately).
- Teams: list with coverage and readiness, remove a team. **Activity log** of platform and admin actions.

### Security summary
- bcrypt password hashing; sessions are random 256-bit tokens in an **HTTP-only** cookie (`SameSite=Lax` by default, `Secure` in production); only their SHA-256 hash is stored, so sessions expire and can be revoked (logout, password change or reset, account deactivation).
- **CSRF**: double-submit token on every state-changing request.
- **Rate limits**: 10 login or password-reset attempts per account per network every 15 minutes (so guessing one person's password is slow, but nobody else is locked out), a generous per-network cap of 200 sign-in/sign-up requests per 15 minutes (a whole class on one Wi-Fi can register), and per-user limits on the API overall and the AI endpoints. Set `TRUST_PROXY=true` behind a proxy so the server sees real client addresses.
- Zod validation on all input; parameterised SQL via Drizzle; React escapes output; links accept only `http(s)` URLs; uploads are checked by size, MIME type **and file signature**; Helmet security headers with a CSP (HSTS when served over HTTPS); errors are logged on the server and users see a generic message. Secrets live only in environment variables, and `.env` files are git-ignored.

---

## 5. How the scores are calculated

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

## 6. Configuring the AI provider

The AI key lives **only** in the backend environment. The browser talks to `/api/assistant` and `/api/career`, never to the AI provider.

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

- **Without a key** (`AI_PROVIDER=none`): the assistant runs as a labelled **Basic assistant** that answers common questions from the student's data using rules. The career page labels its recommendations **Rule-based**.
- **If the AI call fails** (wrong key, timeout): the student still gets a basic answer, plus a visible notice that the AI provider didn't respond.

---

## 7. Creating an administrator

Students can only register as students. Administrators are created on the server:

```bash
# locally (development)
npm run create-admin -- --email placement@college.edu --name "Placement Cell" --password "Str0ngPassw0rd"
# on a production server after `npm run build`
npm run create-admin:prod -w backend -- --email placement@college.edu --password "Str0ngPassw0rd"
```

If you leave out `--password`, a strong random one is generated and printed once. Running the command with an existing email deliberately promotes that account to admin and resets its password.

**On hosts without a shell** (e.g. Render's free plan), set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the environment instead: the first administrator is created when the server starts, only if no account uses that email yet. It never changes or promotes an existing account (so nobody can register that address first and become an admin). Remove `ADMIN_PASSWORD` once the account exists. To change an administrator's password later, use **Forgot password** on the login page (the reset link is emailed, or printed in the server log without SMTP) or run `create-admin` again.

Admins only use the admin area; they can't apply to opportunities or join teams.

---

## 8. Email

When `SMTP_HOST` is empty (the default), password-reset and verification emails are **printed in the backend log**, so you can copy the link during development. To send real emails (needed for password resets on a public site), fill in the `SMTP_*` variables (any SMTP provider). Set `EMAIL_VERIFICATION_REQUIRED=true` to require email verification before login (only with SMTP configured). `ALLOWED_EMAIL_DOMAINS=college.edu` restricts registration to college emails.

---

## 9. Database

- The schema lives in `backend/src/db/schema.ts`: users, sessions, verification and reset tokens, student profiles, a shared skills catalogue, student skills, projects, achievements, certifications, opportunities and their skills, applications with status history, teams with required skills, members and invitations, notifications, chat conversations and messages, career progress and weekly goals, and activity logs.
- Foreign keys use explicit delete behaviour (cascade for owned data, restrict for catalogue skills, set-null for audit references). Unique constraints prevent duplicate emails, duplicate applications, duplicate skills per student and **duplicate pending invitations** (a partial unique index).
- **Migrations** are versioned SQL files in `backend/drizzle/`, applied in order and recorded in the `drizzle.__drizzle_migrations` table. The server applies pending migrations automatically on start (`AUTO_MIGRATE=true`), or run `npm run db:migrate` yourself.
  - `0000_init.sql`: all tables.
  - `0001_multi_user_privacy.sql`: adds `student_profiles.show_in_directory` (boolean, default `false`). It only adds a column, so **existing data is kept**; existing students start hidden from teammate search until they switch it on in their profile (re-running `npm run db:seed` makes the demo students discoverable again).
- To change the schema: edit `schema.ts` → `npm run db:generate` (creates a new SQL file in `backend/drizzle/`) → `npm run db:migrate`. Never edit a migration that has already been applied to a shared database.
- `npm run db:reset` drops and recreates everything, then seeds (development only, same real-account protection as the seed). `npm run db:studio` opens Drizzle Studio to browse the data.

> **Why Drizzle instead of Prisma?** Prisma needs to download native engine binaries from `binaries.prisma.sh`, and that host was blocked in the environment where this project was built and tested. Drizzle is a type-safe TypeScript ORM that installs entirely from npm and produces plain, readable SQL migrations, so every migration and database test could actually be run.

---

## 10. Testing

```bash
npm test          # 81 backend tests against the campushub_test database (it is wiped on every run)
```

They cover:
- **multi-user isolation** (`tests/multiuser.test.ts`): the full A/B scenario through the API (A registers, completes onboarding step by step, adds skills/project/achievement/certification/links, applies, creates a team, logs out; B registers in the same browser, sees none of A's data on any endpoint, adds different data, logs out; A logs back in with everything intact), two browsers at once, ID tampering against every kind of record, user ids smuggled in request bodies, students calling admin APIs, Group Up with real accounts (invite by email, accept, live skills in the analysis), directory opt-in, concurrent accepts and invites, partial onboarding saves, session rotation, the account-switch guard, `no-store` caching, upload access, CSRF rotation, the 72-byte password limit, per-account rate limits and private skill autocomplete
- auth: registration validation, duplicate email, wrong password, HTTP-only cookie, logout, expired session, CSRF, rate limiting, password reset and verification, the startup administrator
- RBAC and ownership, onboarding rules, profile CRUD and completion, image-upload validation
- matching (including recalculation when skills or requirements change), search and filters
- applications: duplicates, deadlines, unpublished opportunities, admin-only status changes with history and notifications, withdrawal
- teams: invitations, duplicate invites, size limits, decline and leave, ownership transfer
- AI: fallback answers, data isolation, and the Anthropic and OpenAI adapters with a mocked network
- career metrics, notifications and admin management

**End-to-end** (real browsers):

```bash
npm i -D playwright && npx playwright install chromium   # one-time
npm run db:seed                                          # sample opportunities + demo students
npm run dev                                              # API + website (rate limits can stay on)
npm run test:e2e                                         # single-student workflow + admin
npm run test:e2e:multiuser                               # two people + one shared computer
```

`test:e2e:multiuser` opens two separate browsers (two people): both register through the UI, complete onboarding, check the empty states, apply, create a team, invite by email and accept, and verify neither ever sees the other's private data, including by typing another person's team URL. A third browser checks one shared computer: logging out in one tab logs out the other, logging in as someone else switches the other tab instead of showing stale data, and a reload keeps the right person signed in. Set `E2E_BASE_URL` to test a deployed site.

---

## 11. Deployment

### Recommended: one URL for everything

In production the API also serves the built website (`SERVE_FRONTEND=true`), so people use **one URL**, cookies stay first-party, and no CORS setup is needed. This works on any Node host (Render, Railway, Fly.io, a VPS…).

```bash
npm ci --include=dev && npm run build    # compiles backend/dist and frontend/dist
npm start                                # one server: API + website on $PORT (migrations run on start)
```

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | your PostgreSQL connection string (add `?sslmode=verify-full` for providers that require TLS from outside their network) |
| `PORT` | set by most hosts automatically (default 4000) |
| `SERVE_FRONTEND` | `true` |
| `APP_URL` | your public URL, e.g. `https://campushub.example.com` (on Render it defaults to the service URL) |
| `COOKIE_SECURE` | `true` (the site must be on HTTPS) |
| `TRUST_PROXY` | `true` behind a load balancer/reverse proxy (Render, Railway, Nginx) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | first administrator (optional; see section 7) |
| `SMTP_*`, `MAIL_FROM` | real email for password resets |
| `AI_*` | optional AI provider |

Nothing in the code assumes `localhost`: the website calls the API on its own origin, and every URL comes from the environment. On start, the server warns about risky production settings (insecure cookies, no proxy trust, localhost `APP_URL`, missing SMTP, or demo `@campushub.dev` accounts in the database).

### Deploying to Render

1. Push the project to GitHub.
2. Render → **New → Blueprint** → pick the repository. `render.yaml` creates a free web service and a free PostgreSQL database and wires `DATABASE_URL`. (If this `campushub` folder is a subfolder of your repository, move `render.yaml` to the repository root and uncomment `rootDir: campushub`.)
3. When asked, enter `ADMIN_EMAIL` and `ADMIN_PASSWORD` for the first administrator (and SMTP details if you have them).
4. Open `https://<your-service>.onrender.com`, log in as the administrator and publish opportunities. Share the URL: every visitor registers their own account.

Manual setup instead of the Blueprint: create a PostgreSQL database, then a **Web Service** with Root Directory `campushub` (if needed), Build Command `npm ci --include=dev && npm run build`, Start Command `npm start`, Health Check Path `/api/health`, and the environment variables from the table above (`DATABASE_URL` = the database's *Internal* URL).

**Free-plan limits to know about** (Render, at the time of writing): the service sleeps after 15 minutes without visitors and the next visit takes about a minute; the disk is temporary, so **uploaded profile pictures and project screenshots disappear** on restarts (use a paid instance with a persistent disk, or external storage, if images matter); and a free Render PostgreSQL database **expires after 30 days** (upgrade it or use another PostgreSQL provider, then just change `DATABASE_URL`). Accounts and all other data live in PostgreSQL and survive restarts.

### Optional: website and API on different domains

Build the website with the API's address and host `frontend/dist` on any static host (with a fallback to `index.html` for client-side routes):

```bash
VITE_API_URL=https://api.example.com npm run build -w frontend
```

On the API set `CORS_ORIGINS=https://www.example.com` (the website's origin), `SERVE_FRONTEND=false`, `COOKIE_SECURE=true`. If both are subdomains of one domain (`www.example.com` + `api.example.com`) keep `COOKIE_SAMESITE=lax`. If they are on unrelated domains (e.g. two different `*.onrender.com` services) you need `COOKIE_SAMESITE=none`, and browsers that block third-party cookies (Safari, some privacy settings) may refuse to keep people logged in, which is why the one-URL setup above is recommended.

---

## 12. Useful scripts

| Command | What it does |
|---|---|
| `npm run dev` | API (watch mode) + Vite dev server |
| `npm run db:migrate` | apply pending migrations (`npm run db:migrate:prod -w backend` after a build, no dev tools needed) |
| `npm run db:seed` | wipe and load demo data (dev only; refuses if real accounts exist) |
| `npm run db:reset` | drop everything, migrate, seed (dev only; same protection) |
| `npm run db:generate` | create a migration after editing `schema.ts` |
| `npm run create-admin -- --email …` | create or promote an administrator (`create-admin:prod -w backend` after a build) |
| `npm test` | backend test suite (81 tests) |
| `npm run test:e2e` / `npm run test:e2e:multiuser` | Playwright workflow tests |
| `npm run build` / `npm start` | production build / run |

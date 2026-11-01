# CampusHub — Project Status

## Completed and tested
| Area | Status | Evidence |
|---|---|---|
| Auth: register, login (remember me), logout, forgot/reset password, email verification, change password | ✅ | backend tests + e2e |
| Sessions (HTTP-only cookie, server-side, revocable, rotated on login), CSRF (rotated on login/logout), per-account rate limits, RBAC, onboarding gate | ✅ | backend tests + e2e |
| **Multi-user isolation**: every account's profile, skills, projects, achievements, certifications, applications, notifications, career data and team membership are private; ownership always comes from the session | ✅ | `tests/multiuser.test.ts` (A/B scenario, ID tampering on every record type) + two-browser e2e |
| Shared computers: account-switch guard (`409 ACCOUNT_CHANGED`), tab sync, full UI reset on account change, safe post-login redirect, `Cache-Control: no-store` | ✅ | backend tests + e2e (two tabs) |
| Step-by-step onboarding (basics + 1 skill required; projects, achievements/certifications, links optional; completion review) | ✅ | backend tests + both e2e scripts |
| Empty states for new accounts (projects, achievements, certifications, skills, applications, teams, notifications, opportunities, admin tables) | ✅ | e2e |
| Dashboard computed from the student's own data | ✅ | e2e |
| Profile CRUD (skills, projects, achievements, certifications, links, avatar & project images) + privacy setting | ✅ | backend tests + e2e |
| Uploaded images only for logged-in users; project screenshots only for their owner and admins | ✅ | backend tests |
| Opportunities: search, filters, sorting, detail, apply, duplicate/deadline protection | ✅ | backend tests + e2e |
| Deterministic skill matching that recalculates on skill/requirement changes | ✅ | backend tests + e2e |
| Application tracker with status history, admin-only status changes, withdraw; admins see every student's applications | ✅ | backend tests + e2e |
| Group Up with real accounts: invite by email or opt-in suggestions, accept/decline, live member skills in the analysis, team-skills view, size limits safe under concurrency | ✅ | backend tests (incl. concurrent accepts) + e2e |
| Notifications (persistent, badge, panel, read / read-all, automatic alerts) | ✅ | backend tests + e2e |
| Career tracker: measured scores + formulas, weekly goals, history, recommendations | ✅ | backend tests + e2e |
| AI assistant: chat, history, clear, labelled fallback, provider adapters | ✅ fallback tested live; ⚠️ live LLM untested (no API key available) | backend tests (mocked network) + e2e |
| Admin: overview, opportunities CRUD/publish/applicants, applications, students, teams, activity log | ✅ | backend tests + e2e |
| Responsive layout (desktop-first, tablet, mobile) | ✅ | e2e screenshots at 1440px and 390px |
| Production build, one URL (API serves the SPA), fresh database, migrations on start, startup administrator | ✅ | production smoke test + multi-user e2e against the built app |
| Frontend on a separate origin (`VITE_API_URL` + `CORS_ORIGINS`) | ✅ | multi-user e2e against a separately served build |
| Database migration `0001_multi_user_privacy` on an existing populated database (data preserved) | ✅ | applied to the seeded development database |

## Test results (final run)
- Backend: **81 / 81** passing (`npm test`), against real PostgreSQL 16
- End-to-end, single student + admin: **35 / 35** passing (`npm run test:e2e`, rate limits on)
- End-to-end, two people + shared computer: **30 / 30** passing (`npm run test:e2e:multiuser`) on the dev server, on the production build, and with the frontend on a separate origin
- `npm audit`: 0 vulnerabilities

## Known limitations / next steps
1. **Live AI not verified**: no API key was available. The Anthropic and OpenAI adapters are covered by unit tests with a mocked network.
2. **SMTP**: real email delivery isn't tested. Without SMTP, reset/verification links are printed to the server log, so on a public site configure SMTP for password resets.
3. **Uploaded images** are stored on the server's disk. Hosts with temporary disks (e.g. Render's free plan) lose them on restart; use a persistent disk or add S3/Cloudinary storage.
4. **Render free plan**: the service sleeps after 15 idle minutes and free PostgreSQL databases expire after 30 days.
5. Administrators have no in-app password-change screen (use Forgot password or `create-admin`).
6. No account self-deletion or data export yet; administrators can deactivate accounts.
7. **ORM**: Drizzle instead of Prisma (Prisma's binary host was blocked in the build sandbox). `docker-compose.yml` was not run in the build environment.

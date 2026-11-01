/**
 * CampusHub multi-user end-to-end test: two people, one URL.
 *
 * Drives real browsers through the A/B scenario: two separate browsers (two people on two
 * computers) register and use their own accounts, collaborate through Group Up, and never see
 * each other's private data. A third browser checks account switching on one shared computer
 * (two tabs), page reloads and logout.
 *
 * Prerequisites: API on :4000 and frontend on :5173 (`npm run dev`) and a seeded development
 * database (`npm run db:seed`) for the sample opportunities. Requires Playwright.
 *
 *   node e2e/run-multiuser-e2e.mjs        (screenshots: e2e/screenshots/mu-*.png)
 */
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const shots = path.join(path.dirname(fileURLToPath(import.meta.url)), "screenshots");
mkdirSync(shots, { recursive: true });

const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  → ${extra}` : ""}`);
const run = Date.now();
const A = { name: "Asha Verma", first: "Asha", email: `mu.asha.${run}@campushub.dev`, password: "AshaPass123", project: `ASHA-PROJECT-${run}`, award: `ASHA-AWARD-${run}`, team: `Asha Team ${run}` };
const B = { name: "Bharat Rao", first: "Bharat", email: `mu.bharat.${run}@campushub.dev`, password: "BharatPass123" };

const browser = await chromium.launch();
const consoleErrors = [];
const serverErrors = [];
async function newPerson() {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  watch(page);
  return { ctx, page };
}
function watch(page) {
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/401|409|Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
  page.on("response", (r) => r.status() >= 500 && serverErrors.push(`${r.status()} ${r.url()}`));
}
const shot = (page, name) => page.screenshot({ path: path.join(shots, `mu-${name}.png`) });
const toast = async (page, text) => page.locator(".toast", { hasText: text }).first().waitFor({ timeout: 5000 }).then(() => true, () => false);
const bodyText = (page) => page.locator("body").innerText();
const headerName = (page) => page.locator(".user-menu-btn .name").innerText();

async function register(page, person) {
  await page.goto(`${BASE}/register`);
  await page.fill("#fullName", person.name);
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.fill("#confirmPassword", person.password);
  await page.fill("#college", "CampusHub University");
  await page.fill("#course", "B.Tech CSE");
  await page.selectOption("#semester", "4");
  await page.check("input[type=checkbox]");
  await page.click("button[type=submit]");
  await page.waitForURL("**/login");
}
async function login(page, person) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", person.email);
  await page.fill("#password", person.password);
  await page.click("button[type=submit]");
}
async function logout(page) {
  await page.click(".user-menu-btn");
  await page.click(".dropdown >> text=Log out");
  await page.waitForURL("**/login");
}
async function addSkills(page, skills) {
  for (const s of skills) {
    await page.fill("#skill-input", s);
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(200);
}

try {
  /* ================================================================ person A (own browser) */
  const a = await newPerson();
  await register(a.page, A);
  await login(a.page, A);
  await a.page.waitForURL("**/onboarding");
  check("A: new account starts onboarding", a.page.url().endsWith("/onboarding"));
  // step 1 basics → 2 skills → 3 project → 4 achievement → 5 links → 6 finish
  await a.page.fill("#bio", "Full-stack student who builds React and Node.js apps for campus clubs.");
  await a.page.click("button:has-text('Save & continue')");
  await a.page.waitForSelector("#skill-input");
  await addSkills(a.page, ["React", "Node.js"]);
  await a.page.click("button:has-text('Save & continue')");
  await a.page.waitForSelector("#project-title");
  await a.page.fill("#project-title", A.project);
  await a.page.fill("#project-description", "A private project that only Asha should ever see.");
  await a.page.click("button:has-text('Add project')");
  await a.page.waitForSelector(`.list-item:has-text('${A.project}')`);
  await a.page.click("button:has-text('Continue')");
  await a.page.waitForSelector("#achievement-title");
  await a.page.fill("#achievement-title", A.award);
  await a.page.click("button:has-text('Add achievement')");
  await a.page.waitForSelector(`.list-item:has-text('${A.award}')`);
  await a.page.click("button:has-text('Continue')");
  await a.page.waitForSelector("#github");
  await a.page.fill("#github", `github.com/asha-${run}`);
  await a.page.click("button:has-text('Save & continue')");
  await a.page.waitForSelector("text=Show me in Group Up teammate search");
  check("A: optional teammate search is off by default", !(await a.page.isChecked(".consent-box input[type=checkbox]")));
  await shot(a.page, "01-a-finish");
  await a.page.click("text=Finish & go to dashboard");
  await a.page.waitForURL("**/dashboard");
  await a.page.waitForSelector(".stats-grid");
  const aProjects = await a.page.locator(".stat-card", { hasText: "Projects" }).locator(".stat-value").innerText();
  check("A: dashboard shows A's own project count", aProjects.trim() === "1", aProjects);

  // A applies to an opportunity
  await a.page.goto(`${BASE}/opportunities`);
  await a.page.waitForSelector(".opportunities-grid .opportunity-card");
  const oss = a.page.locator(".opportunity-card", { hasText: "Open Source Campus Portal Project" });
  await oss.locator("button:has-text('Apply')").click();
  await a.page.waitForSelector(".modal");
  await a.page.click(".modal button:has-text('Submit application')");
  check("A: application submitted", await toast(a.page, "Application submitted"));

  // A creates a team
  await a.page.goto(`${BASE}/teams`);
  await a.page.waitForSelector("text=You haven't joined a group yet");
  check("A: Group Up empty state before joining a team", true);
  await a.page.click("button:has-text('Create a team')");
  await a.page.fill(".modal input[placeholder='Team Phoenix']", A.team);
  await a.page.fill(".modal input[placeholder='Smart Campus Navigator']", "Campus Events App");
  for (const s of ["React", "PostgreSQL"]) {
    await a.page.fill(".modal .tag-box input", s);
    await a.page.keyboard.press("Enter");
  }
  await a.page.click(".modal button:has-text('Create team')");
  await a.page.waitForURL("**/teams/*");
  await a.page.waitForSelector(".team-stat");
  const teamUrl = a.page.url();
  const coverageBefore = await a.page.locator(".team-stat").first().locator(".stat-value").innerText();
  check("A: team created (required-skill coverage 50% with A alone)", coverageBefore.trim() === "50%", coverageBefore);

  /* ================================================================ person B (separate browser) */
  const b = await newPerson();
  await register(b.page, B);
  await login(b.page, B);
  await b.page.waitForURL("**/onboarding");
  await b.page.click("button:has-text('Save & continue')"); // basics already filled at registration
  await b.page.waitForSelector("#skill-input");
  await addSkills(b.page, ["PostgreSQL"]);
  await b.page.click("button:has-text('Save & continue')");
  await b.page.click("button:has-text('Skip for now')"); // projects
  await b.page.click("button:has-text('Skip for now')"); // achievements
  await b.page.click("button:has-text('Skip for now')"); // links
  await b.page.click("text=Finish & go to dashboard");
  await b.page.waitForURL("**/dashboard");
  await b.page.waitForSelector(".stats-grid");
  check("B: minimal onboarding (basics + 1 skill) is enough", b.page.url().endsWith("/dashboard"));
  check("B: dashboard greets B", (await bodyText(b.page)).includes(`Welcome back, ${B.first}`));

  // B's empty states
  await b.page.goto(`${BASE}/profile`);
  await b.page.waitForSelector(".profile-card");
  const bProfile = await bodyText(b.page);
  check("B: profile says 'No projects yet' with 'Add your first project'", bProfile.includes("No projects yet") && bProfile.includes("Add your first project"));
  check("B: profile says 'No achievements yet'", bProfile.includes("No achievements yet"));
  await shot(b.page, "02-b-empty-profile");
  await b.page.goto(`${BASE}/applications`);
  await b.page.waitForSelector(".empty");
  const bApps = await bodyText(b.page);
  check("B: 'No applications yet' with 'Explore opportunities'", bApps.includes("No applications yet") && bApps.includes("Explore opportunities"));
  await b.page.goto(`${BASE}/teams`);
  await b.page.waitForSelector(".empty");
  check("B: 'You haven't joined a group yet'", (await bodyText(b.page)).includes("You haven't joined a group yet"));
  await b.page.click(".notification-btn");
  await b.page.waitForSelector(".notif-panel");
  if (await b.page.locator(".notif-panel button:has-text('Mark all as read'):not([disabled])").count()) await b.page.click(".notif-panel button:has-text('Mark all as read')");
  await b.page.waitForSelector(".notif-caught-up");
  check("B: notifications say 'You're all caught up'", (await b.page.locator(".notif-caught-up").innerText()).includes("You're all caught up"));
  await b.page.keyboard.press("Escape");

  // nothing of A's is visible anywhere B can go
  let leaked = [];
  for (const route of ["/dashboard", "/profile", "/applications", "/teams", "/career", "/opportunities"]) {
    await b.page.goto(`${BASE}${route}`);
    await b.page.waitForLoadState("networkidle");
    const text = await bodyText(b.page);
    for (const secret of [A.name, A.email, A.project, A.award, A.team]) if (text.includes(secret)) leaked.push(`${route}: ${secret}`);
  }
  check("B never sees A's name, email, project, achievement or team", leaked.length === 0, leaked.join(", "));
  // URL tampering: B opens A's team page directly
  await b.page.goto(teamUrl);
  await b.page.waitForSelector(".alert-error");
  check("B cannot open A's team by URL", (await bodyText(b.page)).includes("Team not found") && !(await bodyText(b.page)).includes(A.team));
  await b.page.goto(`${BASE}/admin`);
  await b.page.waitForURL("**/dashboard");
  check("B is redirected away from the admin area", b.page.url().endsWith("/dashboard"));

  /* ================================================================ Group Up with real accounts */
  await a.page.goto(teamUrl);
  await a.page.waitForSelector("#invite-email");
  await a.page.fill("#invite-email", B.email);
  await a.page.click("button:has-text('Send invitation')");
  check("A invites B by email", await toast(a.page, `Invitation sent to ${B.name}`));

  await b.page.goto(`${BASE}/teams`);
  await b.page.waitForSelector("text=Invitations for you");
  await b.page.locator(".list-item", { hasText: A.team }).locator("button:has-text('Accept')").click();
  check("B accepts the invitation", await toast(b.page, `You joined ${A.team}`));
  await b.page.locator(`a.card:has-text('${A.team}')`).click();
  await b.page.waitForSelector(".team-stat");
  const bTeamText = await bodyText(b.page);
  check("B sees both members of the team", bTeamText.includes(A.name) && bTeamText.includes(B.name));
  check("team skills come from B's real profile", (await b.page.locator(".card:has(h2:text('Team skills')) .chip", { hasText: "PostgreSQL" }).count()) === 1);
  check("membership does not expose A's private project", !bTeamText.includes(A.project));
  await shot(b.page, "03-b-team");

  await a.page.reload();
  await a.page.waitForSelector(".team-stat");
  const coverageAfter = await a.page.locator(".team-stat").first().locator(".stat-value").innerText();
  check("A sees the coverage rise to 100% with B's real skill", coverageAfter.trim() === "100%", coverageAfter);

  /* ================================================================ one shared computer, two tabs */
  const shared = await newPerson();
  const tab1 = shared.page;
  await login(tab1, A);
  await tab1.waitForURL("**/dashboard");
  await tab1.waitForSelector(".stats-grid");
  const tab2 = await shared.ctx.newPage();
  watch(tab2);
  await tab2.goto(`${BASE}/dashboard`);
  await tab2.waitForSelector(".stats-grid");
  check("second tab of the same browser shows A too", (await headerName(tab2)) === A.name);
  await logout(tab2);
  await tab1.waitForURL("**/login", { timeout: 8000 }).catch(() => undefined);
  check("logging out in one tab logs out the other tab", tab1.url().includes("/login"));
  await login(tab2, B);
  await tab2.waitForURL("**/dashboard");
  await tab1.bringToFront();
  await tab1.waitForSelector(".stats-grid", { timeout: 8000 }).catch(() => undefined);
  await tab1.waitForTimeout(500);
  check("the other tab follows to B's account instead of showing A's data", (await headerName(tab1).catch(() => "")) === B.name && !(await bodyText(tab1)).includes(A.name));
  await tab1.reload();
  await tab1.waitForSelector(".stats-grid");
  check("a page reload keeps the current user (B) signed in", (await headerName(tab1)) === B.name);
  await logout(tab1);
  await tab1.goto(`${BASE}/profile`);
  await tab1.waitForURL("**/login");
  check("after logout, protected pages need a login again", tab1.url().includes("/login"));
  await login(tab1, A);
  await tab1.waitForURL("**/dashboard");
  await tab1.goto(`${BASE}/profile`);
  await tab1.waitForSelector(".profile-card");
  const aAgain = await bodyText(tab1);
  check("A logs back in and A's data is intact", aAgain.includes(A.project) && aAgain.includes(A.award) && !aAgain.includes(B.email));
  await shot(tab1, "04-a-back");
} catch (error) {
  check("multi-user e2e run completed without crashing", false, error.message.split("\n")[0]);
}

check("no uncaught browser errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
check("no server 5xx responses", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);

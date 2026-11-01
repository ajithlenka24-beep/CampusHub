/**
 * CampusHub end-to-end test: drives a real browser through the full workflow.
 *
 * Prerequisites: API on :4000 and frontend on :5173 (`npm run dev`), seeded database (`npm run db:seed`).
 * Requires Playwright: `npm i -D playwright && npx playwright install chromium`
 *
 *   node e2e/run-e2e.mjs            (screenshots are written to e2e/screenshots/)
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
const email = `e2e.student.${Date.now()}@campushub.dev`;
const PASSWORD = "E2eStudent1";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
const serverErrors = [];
page.on("pageerror", (e) => consoleErrors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/401|Failed to load resource/.test(m.text()) && consoleErrors.push(m.text()));
page.on("response", (r) => r.status() >= 500 && serverErrors.push(`${r.status()} ${r.url()}`));

const shot = (name) => page.screenshot({ path: path.join(shots, `${name}.png`) });
const toast = async (text) => (await page.locator(".toast", { hasText: text }).count()) > 0;

async function login(user, password) {
  await page.goto(`${BASE}/login`);
  await page.fill("#email", user);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
}
async function logout() {
  await page.click(".user-menu-btn");
  await page.click("text=Log out");
  await page.waitForURL("**/login");
}

try {
  // 1. First visit → login page; protected pages redirect to login
  await page.goto(BASE);
  await page.waitForURL("**/login");
  check("first visit shows the login page", page.url().endsWith("/login"));
  await page.waitForTimeout(400);
  await shot("01-login");
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/login");
  check("dashboard is protected when logged out", page.url().includes("/login"));

  // 2. Registration (with client-side validation first)
  await page.goto(`${BASE}/register`);
  await page.click("button[type=submit]");
  check("registration validates empty form", (await page.locator(".field-error").count()) >= 5);
  await page.fill("#fullName", "Lucky Sharma");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.fill("#confirmPassword", PASSWORD);
  await page.fill("#college", "CampusHub University");
  await page.fill("#course", "B.Tech CSE");
  await page.selectOption("#semester", "3");
  await page.check("input[type=checkbox]");
  await shot("02-register");
  await page.click("button[type=submit]");
  await page.waitForURL("**/login");
  const registered = await page.waitForSelector(".alert-success", { timeout: 5000 }).then(() => true, () => false);
  check("registration redirects to login with a message", registered);

  // 3. Wrong password, then login → onboarding (not the dashboard)
  await login(email, "WrongPass1");
  await page.waitForSelector(".alert-error");
  check("wrong password shows an error", (await page.locator(".alert-error").textContent()).includes("Incorrect email or password"));
  await login(email, PASSWORD);
  await page.waitForURL("**/onboarding");
  check("new student is sent to onboarding", page.url().endsWith("/onboarding"));
  await page.goto(`${BASE}/dashboard`);
  await page.waitForURL("**/onboarding");
  check("dashboard blocked until onboarding is complete", page.url().endsWith("/onboarding"));

  // 4. Onboarding (6 steps: basics and skills required, the rest optional)
  check("onboarding starts with basic information prefilled from registration", (await page.inputValue("#college")) === "CampusHub University");
  await page.fill("#department", "Computer Science");
  await page.fill("#bio", "Second-year CSE student who loves C++, algorithms and building useful web apps.");
  await page.click("button:has-text('Save & continue')");
  await page.waitForSelector("#skill-input");
  await page.click("button:has-text('Save & continue')");
  check("skills step requires at least one skill", (await page.locator(".field-error", { hasText: "at least one skill" }).count()) === 1);
  for (const s of ["C++", "DSA", "OOP"]) {
    await page.fill("#skill-input", s);
    await page.keyboard.press("Enter");
  }
  await page.waitForTimeout(300);
  await shot("03-onboarding");
  await page.click("button:has-text('Save & continue')");
  await page.waitForSelector("text=No projects yet");
  await page.click("button:has-text('Skip for now')"); // projects (optional)
  await page.waitForSelector("text=Add an achievement");
  await page.click("button:has-text('Skip for now')"); // achievements & certifications (optional)
  await page.waitForSelector("#github");
  await page.fill("#github", "github.com/lucky-dev");
  await page.click("button:has-text('Save & continue')"); // social links (optional)
  await page.waitForSelector("text=Show me in Group Up teammate search");
  await shot("03b-onboarding-finish");
  await page.click("text=Finish & go to dashboard");
  await page.waitForURL("**/dashboard");
  await page.waitForSelector(".stats-grid");
  check("onboarding completes and opens the dashboard", page.url().endsWith("/dashboard"));
  const skillsStat = await page.locator(".stat-card", { hasText: "Skills" }).locator(".stat-value").textContent();
  check("dashboard skill count comes from the database", skillsStat.trim() === "3", skillsStat);
  await page.waitForTimeout(500);
  await shot("04-dashboard");

  // 5. Opportunities: real match % and apply
  await page.click(".side-link:has-text('Opportunities')");
  await page.waitForURL("**/opportunities");
  await page.waitForSelector(".opportunities-grid .opportunity-card");
  const cpp = page.locator(".opportunity-card", { hasText: "C++ Developer Internship" });
  const matchText = await cpp.locator(".match-score").textContent();
  check("C++ internship shows 75% match (3 of 4 skills)", matchText.includes("75%"), matchText);
  await shot("05-opportunities");
  await cpp.locator("button:has-text('Apply')").click();
  await page.waitForSelector(".modal");
  await page.fill(".modal textarea", "I enjoy systems programming in C++ and DSA.");
  await page.click(".modal button:has-text('Submit application')");
  await page.waitForTimeout(800);
  check("apply shows a success toast", await toast("Application submitted"));
  check("card switches to Applied", (await cpp.locator(".btn-success").count()) === 1);

  // 6. Opportunity detail: matched/missing + recommended skill
  await cpp.locator("text=View Details").click();
  await page.waitForSelector(".score-circle");
  check("detail shows missing skill Git", (await page.locator(".match-fail", { hasText: "Git" }).count()) > 0);
  await shot("06-opportunity-detail");

  // 7. Application tracker
  await page.click(".side-link:has-text('My Applications')");
  await page.waitForURL("**/applications");
  await page.waitForSelector(".tracker-item");
  await page.waitForTimeout(300);
  await shot("07a-tracker");
  check("application appears in tracker", (await page.locator(".tracker-item", { hasText: "C++ Developer Internship" }).count()) === 1);
  await page.locator(".tracker-item", { hasText: "C++ Developer Internship" }).click();
  await page.waitForSelector(".timeline-item");
  await shot("07-application-detail");
  await page.keyboard.press("Escape");

  // 8. Profile: add Git → match recalculates to 100%
  await page.click(".side-link:has-text('Profile')");
  await page.waitForURL("**/profile");
  await page.waitForSelector(".profile-card");
  await page.click("button:has-text('Add skill')");
  await page.waitForSelector(".modal .tag-box input");
  await page.fill(".modal .tag-box input", "Git");
  await page.keyboard.press("Enter");
  await page.click(".modal button:has-text('Add skill')");
  await page.waitForTimeout(800);
  check("skill added via profile", (await page.locator("td", { hasText: "Git" }).count()) > 0);
  await shot("08-profile");
  await page.goto(`${BASE}/opportunities?`);
  await page.waitForSelector(".opportunity-card");
  const after = await page.locator(".opportunity-card", { hasText: "C++ Developer Internship" }).locator(".match-score").textContent();
  check("match recalculates after adding Git → 100%", after.includes("100%"), after);

  // 9. Group Up: create team, see analysis, invite a suggested teammate
  await page.click(".side-link:has-text('Group Up')");
  await page.waitForURL("**/teams");
  await page.click("button:has-text('Create a team')");
  await page.fill(".modal input[placeholder='Team Phoenix']", "Code Crusaders");
  await page.fill(".modal input[placeholder='Smart Campus Navigator']", "Placement Prep Portal");
  for (const s of ["React", "Node.js", "Selenium"]) {
    await page.fill(".modal .tag-box input", s);
    await page.keyboard.press("Enter");
  }
  await page.click(".modal button:has-text('Create team')");
  await page.waitForURL("**/teams/*");
  await page.waitForSelector(".team-stat");
  check("team created with coverage analysis", (await page.locator(".team-stat").count()) === 3);
  await page.waitForSelector(".list-item button:has-text('Invite')");
  const firstCandidate = await page.locator(".list-item").first().locator(".title").textContent();
  await page.locator(".list-item button:has-text('Invite')").first().click();
  await page.waitForTimeout(800);
  check("invitation sent to suggested teammate", await toast("Invitation sent"), firstCandidate);
  await page.waitForTimeout(300);
  await shot("09-team-detail");

  // 10. Career tracker + refresh
  await page.click(".side-link:has-text('Career Tracker')");
  await page.waitForURL("**/career");
  await page.waitForSelector(".score-circle.lg");
  check("career tracker shows formulas", (await page.locator(".formula").count()) > 0);
  await page.click("button:has-text('Refresh analysis')");
  await page.waitForTimeout(1200);
  await shot("10-career");

  // 11. AI assistant (fallback mode without an API key)
  await page.click(".side-link:has-text('AI Assistant')");
  await page.waitForURL("**/assistant");
  await page.waitForSelector(".chat-window textarea");
  await page.click("text=Which internships match my current skills?");
  await page.waitForSelector(".msg.assistant .meta", { timeout: 15000 });
  const reply = await page.locator(".msg.assistant").last().textContent();
  check("assistant answers from the student's data", /match/i.test(reply), reply.slice(0, 80));
  check("assistant is labelled as basic (no AI key)", (await page.locator(".alert-info", { hasText: "Basic assistant" }).count()) > 0);
  await shot("11-assistant");

  // 12. Notifications panel
  await page.click(".notification-btn");
  await page.waitForSelector(".notif-panel");
  check("notifications are listed", (await page.locator(".notif-item").count()) >= 2);
  await shot("12-notifications");
  await page.click(".notif-panel button:has-text('Mark all as read')");
  await page.waitForTimeout(400);
  check("mark all as read clears the badge", (await page.locator(".notif-badge").count()) === 0);
  await page.keyboard.press("Escape");

  // 13. Student cannot open admin pages
  await page.goto(`${BASE}/admin`);
  await page.waitForURL("**/dashboard");
  check("student is redirected away from /admin", page.url().endsWith("/dashboard"));

  // 14. Logout → protected pages require login again
  await logout();
  await page.goto(`${BASE}/applications`);
  await page.waitForURL("**/login");
  check("after logout, protected pages redirect to login", page.url().includes("/login"));

  // 15. Admin shortlists the application
  await login("admin@campushub.dev", "Admin@12345");
  await page.waitForURL("**/admin");
  await page.waitForSelector(".stats-grid");
  await shot("13-admin-overview");
  await page.click(".side-link:has-text('Applications')");
  await page.waitForURL("**/admin/applications");
  await page.waitForSelector("tbody tr");
  await page.locator("tr", { hasText: email }).locator("button:has-text('Review')").click();
  await page.waitForSelector(".modal select");
  await page.selectOption(".modal select", "SHORTLISTED");
  await page.fill(".modal input[maxlength='500']", "Technical round next Monday");
  await page.click(".modal button:has-text('Update status')");
  await page.waitForTimeout(800);
  check("admin updates application status", await toast("Status changed to Shortlisted"));
  await shot("14-admin-application");
  await page.keyboard.press("Escape");

  // admin creates an opportunity (CRUD)
  await page.click(".side-link:has-text('Opportunities')");
  await page.waitForURL("**/admin/opportunities");
  await page.click("button:has-text('New opportunity')");
  await page.waitForSelector("#opp-form");
  const inputs = page.locator("#opp-form .form-grid input.input");
  await inputs.nth(0).fill("Backend Developer Internship");
  await inputs.nth(1).fill("ByteWorks");
  await page.fill("#opp-form textarea >> nth=0", "Build REST APIs with Node.js and PostgreSQL alongside senior engineers.");
  await page.fill("#opp-form .tag-box input", "Node.js");
  await page.keyboard.press("Enter");
  await page.fill("#opp-form .tag-box input", "SQL");
  await page.keyboard.press("Enter");
  await page.click(".modal button:has-text('Create opportunity')");
  await page.waitForTimeout(900);
  check("admin creates an opportunity", (await page.locator("td", { hasText: "Backend Developer Internship" }).count()) === 1);
  await shot("15-admin-opportunities");
  await logout();

  // 16. Student sees the status change + notification
  await login(email, PASSWORD);
  await page.waitForURL("**/dashboard");
  await page.goto(`${BASE}/applications`);
  await page.waitForSelector(".tracker-item");
  const badge = await page.locator(".tracker-item", { hasText: "C++ Developer Internship" }).locator(".status-badge").textContent();
  check("student sees Shortlisted status", badge.includes("Shortlisted"), badge);
  await page.click(".notification-btn");
  await page.waitForSelector(".notif-item");
  check("student received the shortlist notification", (await page.locator(".notif-item", { hasText: "shortlisted" }).count()) > 0);
  await page.keyboard.press("Escape");
  await logout();

  // 17. Invited teammate accepts
  await login(`${firstCandidate.split(" ")[0].toLowerCase()}@campushub.dev`, "Student@123");
  await page.waitForURL("**/dashboard");
  await page.goto(`${BASE}/teams`);
  await page.waitForSelector("text=Invitations for you");
  await page.locator(".list-item", { hasText: "Code Crusaders" }).locator("button:has-text('Accept')").click();
  await page.waitForTimeout(900);
  check("invitee accepts and joins the team", await toast("You joined Code Crusaders"));
  await logout();

  // 18. Mobile layout
  await page.setViewportSize({ width: 390, height: 844 });
  await login("ajith@campushub.dev", "Student@123");
  await page.waitForURL("**/dashboard");
  await page.waitForSelector(".stats-grid");
  await page.waitForTimeout(400);
  await shot("16-mobile-dashboard");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check("no horizontal overflow on mobile", !overflow);
  await page.click(".menu-btn");
  await page.waitForTimeout(300);
  await shot("17-mobile-menu");
  await page.click(".side-link:has-text('Opportunities')");
  await page.waitForURL("**/opportunities");
  await page.waitForSelector(".opportunities-grid .opportunity-card");
  await page.waitForTimeout(300);
  await shot("18-mobile-opportunities");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/login`);
} catch (error) {
  check("e2e run completed without crashing", false, error.message.split("\n")[0]);
  await shot("zz-failure").catch(() => undefined);
}

check("no uncaught browser errors", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));
check("no server 5xx responses", serverErrors.length === 0, serverErrors.slice(0, 3).join(" | "));
console.log(results.join("\n"));
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
await browser.close();
process.exit(failed ? 1 : 0);

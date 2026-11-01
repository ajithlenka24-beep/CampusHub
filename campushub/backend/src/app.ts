import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env.js";
import { accountGuard, loadUser } from "./middleware/auth.js";
import { csrfProtection } from "./middleware/csrf.js";
import { errorHandler, notFoundHandler } from "./middleware/error.js";
import { createRateLimiters } from "./middleware/rateLimit.js";
import { uploadAccess, uploadRoot } from "./middleware/upload.js";
import { adminRouter } from "./routes/admin.routes.js";
import { assistantRouter } from "./routes/assistant.routes.js";
import { authRouter } from "./routes/auth.routes.js";
import { careerRouter } from "./routes/career.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { directoryRouter } from "./routes/directory.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { applicationsRouter, opportunitiesRouter } from "./routes/opportunities.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { invitationsRouter, teamsRouter } from "./routes/teams.routes.js";
import { aiStatus } from "./services/ai/provider.js";

export function createApp(options: { rateLimit?: boolean } = {}) {
  const app = express();
  const limiters = createRateLimiters(options.rateLimit ?? env.RATE_LIMIT_ENABLED);

  if (env.TRUST_PROXY) app.set("trust proxy", 1);
  app.disable("x-powered-by");
  // Security headers. HTTPS-only headers are sent only when the app runs behind HTTPS
  // (COOKIE_SECURE=true), so a demo over http://<LAN-IP> still works.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: env.COOKIE_SECURE ? [] : null } },
      strictTransportSecurity: env.COOKIE_SECURE ? undefined : false,
    }),
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  if (env.LOG_REQUESTS && !env.isTest) {
    // minimal request log: method, path, status, time (never bodies or cookies)
    app.use((req, res, next) => {
      const started = Date.now();
      res.on("finish", () => {
        if (req.path.startsWith("/api")) console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - started} ms)`);
      });
      next();
    });
  }

  // uploaded images (random UUID names; only images are ever written here), for signed-in users only
  app.use("/uploads", loadUser, uploadAccess, express.static(uploadRoot, { cacheControl: false, dotfiles: "deny", index: false }));
  app.use("/uploads", (_req, res) => res.status(404).end());

  app.get("/api/health", (_req, res) => res.json({ status: "ok", ai: aiStatus().mode }));

  // API responses contain personal data: never let browsers or proxies cache them
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // session first, so rate limits are per user (not per shared campus IP) once someone is logged in
  app.use("/api", loadUser, limiters.general, accountGuard, csrfProtection);
  app.use("/api/auth", authRouter(limiters));
  app.use("/api/profile", profileRouter());
  app.use("/api/dashboard", dashboardRouter());
  app.use("/api/opportunities", opportunitiesRouter());
  app.use("/api/applications", applicationsRouter());
  app.use("/api/teams", teamsRouter());
  app.use("/api/invitations", invitationsRouter());
  app.use("/api/notifications", notificationsRouter());
  app.use("/api/career", careerRouter(limiters.ai));
  app.use("/api/assistant", assistantRouter(limiters.ai));
  app.use("/api/admin", adminRouter());
  app.use("/api", directoryRouter());
  app.use("/api", notFoundHandler);

  // Production: serve the built React app from the same origin
  if (env.SERVE_FRONTEND) {
    const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../frontend/dist");
    if (fs.existsSync(dist)) {
      app.use(express.static(dist, { index: false, maxAge: "1h" }));
      app.get(/^(?!\/api|\/uploads).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
    } else {
      console.warn("[CampusHub] SERVE_FRONTEND is true but frontend/dist does not exist. Run `npm run build` first.");
    }
  }

  app.use(errorHandler);
  return app;
}

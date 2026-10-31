import { z } from "zod";

/**
 * All configuration comes from environment variables (see .env.example).
 * The process refuses to start if a required value is missing or invalid,
 * so misconfiguration is caught immediately instead of at runtime.
 */
const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined || value === "" ? fallback : ["1", "true", "yes", "on"].includes(value.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  // Public URL of the frontend (used in emails and for CORS)
  APP_URL: z.string().url().default("http://localhost:5173"),
  CORS_ORIGINS: z.string().default("http://localhost:5173"),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(12),
  REMEMBER_ME_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_SECURE: bool(false),
  TRUST_PROXY: bool(false),

  EMAIL_VERIFICATION_REQUIRED: bool(false),
  ALLOWED_EMAIL_DOMAINS: z.string().default(""),

  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  MAIL_FROM: z.string().default("CampusHub <no-reply@campushub.local>"),

  AI_PROVIDER: z.enum(["none", "anthropic", "openai"]).default("none"),
  AI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
  AI_BASE_URL: z.string().default(""),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),

  UPLOAD_DIR: z.string().default("uploads"),
  MAX_UPLOAD_MB: z.coerce.number().positive().default(2),

  RATE_LIMIT_ENABLED: bool(true),
  SERVE_FRONTEND: bool(false),
  LOG_REQUESTS: bool(true),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error("\n[CampusHub] Invalid environment configuration:");
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("Copy .env.example to .env and fill in the values.\n");
  process.exit(1);
}

const raw = parsed.data;

if (raw.NODE_ENV === "production" && !raw.COOKIE_SECURE) {
  console.warn("[CampusHub] COOKIE_SECURE is false in production. Enable it when serving over HTTPS.");
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === "production",
  isTest: raw.NODE_ENV === "test",
  corsOrigins: raw.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
  allowedEmailDomains: raw.ALLOWED_EMAIL_DOMAINS.split(",").map((d) => d.trim().toLowerCase()).filter(Boolean),
  aiEnabled: raw.AI_PROVIDER !== "none" && raw.AI_API_KEY.length > 0 && raw.AI_MODEL.length > 0,
  smtpEnabled: raw.SMTP_HOST.length > 0,
};

export type Env = typeof env;

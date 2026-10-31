import { z } from "zod";

/** Trimmed text with a length range. */
export const text = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(min, min === 1 ? `${label} is required.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be at most ${max} characters.`);

export const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .optional()
    .default("");

export const email = z
  .string({ error: "Email is required." })
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Enter a valid email address." }));

/** bcrypt only uses the first 72 bytes, so longer passwords are rejected. */
export const password = z
  .string({ error: "Password is required." })
  .min(8, "Password must be at least 8 characters.")
  .max(72, "Password must be at most 72 characters.")
  .regex(/[a-z]/, "Password must contain a lowercase letter.")
  .regex(/[A-Z]/, "Password must contain an uppercase letter.")
  .regex(/[0-9]/, "Password must contain a number.");

/**
 * Optional link: "" / null → null. "github.com/me" → "https://github.com/me".
 * Only http(s) URLs are accepted (blocks javascript: links).
 */
export const optionalUrl = (label: string) =>
  z
    .union([z.string(), z.null()])
    .optional()
    .transform((value, ctx) => {
      const raw = (value ?? "").trim();
      if (!raw) return null;
      const candidate = /^[a-z][a-z\d+.-]*:/i.test(raw) ? raw : `https://${raw}`;
      try {
        const url = new URL(candidate);
        if (!["http:", "https:"].includes(url.protocol) || !url.hostname.includes(".")) throw new Error("bad");
        if (url.href.length > 255) throw new Error("long");
        return url.href;
      } catch {
        ctx.addIssue({ code: "custom", message: `${label} must be a valid web address (https://…).` });
        return z.NEVER;
      }
    });

export const semester = z.coerce
  .number({ error: "Semester must be a number." })
  .int("Semester must be a whole number.")
  .min(1, "Semester must be between 1 and 12.")
  .max(12, "Semester must be between 1 and 12.");

export const proficiency = z.coerce.number().int().min(0, "Proficiency must be 0–100.").max(100, "Proficiency must be 0–100.");

export const isoDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
      ctx.addIssue({ code: "custom", message: "Dates must look like YYYY-MM-DD." });
      return z.NEVER;
    }
    return value;
  });

export const uuidParam = z.object({ id: z.uuid({ error: "Invalid id." }) });
export const intParam = z.object({ id: z.coerce.number().int().positive() });

import type { z } from "zod";
import { badRequest } from "../utils/httpError.js";

/** Validates input with a zod schema; throws a 400 with per-field messages on failure. */
export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
    throw badRequest(details[0]?.message ?? "Invalid input.", details);
  }
  return result.data;
}

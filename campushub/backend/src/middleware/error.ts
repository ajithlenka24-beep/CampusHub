import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

/** Converts every error into a consistent JSON response without leaking internals. */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof HttpError) {
    return res.status(error.status).json({ error: { code: error.code, message: error.message, details: error.details } });
  }

  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? `Images must be smaller than ${env.MAX_UPLOAD_MB} MB.` : "Upload failed.";
    return res.status(400).json({ error: { code: "UPLOAD_ERROR", message } });
  }

  const err = error as { type?: string; code?: string; status?: number; message?: string };
  if (err?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "The request body is not valid JSON." } });
  }
  if (err?.type === "entity.too.large") {
    return res.status(413).json({ error: { code: "TOO_LARGE", message: "The request is too large." } });
  }
  // PostgreSQL unique violation (e.g. duplicate email or duplicate application)
  if (err?.code === "23505") {
    return res.status(409).json({ error: { code: "CONFLICT", message: "This record already exists." } });
  }
  if (err?.code === "23503") {
    return res.status(409).json({ error: { code: "CONFLICT", message: "This record is still referenced by other data." } });
  }

  // Unknown error: log it on the server, show a generic message to the user
  console.error(`[CampusHub] ${req.method} ${req.originalUrl} failed:`, env.isProduction ? err?.message : error);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again." } });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `No API route for ${req.method} ${req.path}` } });
}

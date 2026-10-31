import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";
import { env } from "../config/env.js";
import { badRequest } from "../utils/httpError.js";

export const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);

/** Files are kept in memory first so their real type can be checked before saving. */
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (["image/png", "image/jpeg", "image/webp"].includes(file.mimetype)) cb(null, true);
    else cb(badRequest("Only PNG, JPEG or WebP images are allowed."));
  },
});

/** Checks the file's "magic bytes" so a renamed script cannot pretend to be an image. */
function detectImageType(buffer: Buffer): "png" | "jpg" | "webp" | null {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpg";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

/** Validates and stores an uploaded image; returns its public URL (/uploads/<folder>/<random>.ext). */
export async function saveImage(file: Express.Multer.File | undefined, folder: "avatars" | "projects"): Promise<string> {
  if (!file) throw badRequest("Please choose an image to upload.");
  const ext = detectImageType(file.buffer);
  if (!ext) throw badRequest("That file is not a valid PNG, JPEG or WebP image.");
  const dir = path.join(uploadRoot, folder);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${randomUUID()}.${ext}`;
  await fs.writeFile(path.join(dir, filename), file.buffer);
  return `/uploads/${folder}/${filename}`;
}

/** Deletes a previously uploaded file (only inside the upload folder). */
export async function removeUpload(publicUrl: string | null | undefined) {
  if (!publicUrl?.startsWith("/uploads/")) return;
  const target = path.resolve(uploadRoot, publicUrl.replace(/^\/uploads\//, ""));
  if (!target.startsWith(uploadRoot + path.sep)) return;
  await fs.rm(target, { force: true });
}

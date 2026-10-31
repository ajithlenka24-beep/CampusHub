import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Cryptographically random, URL-safe token (default 256 bits). */
export const randomToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");

/** Tokens are stored hashed, so a database leak does not expose usable tokens. */
export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

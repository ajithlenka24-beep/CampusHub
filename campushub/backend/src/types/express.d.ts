import type { UserRole } from "../db/schema.js";

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  onboardingCompleted: boolean;
  emailVerified: boolean;
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};

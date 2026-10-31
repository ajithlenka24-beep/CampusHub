import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { PageLoading } from "../components/ui";
import { homePathFor, useAuth } from "../context/AuthContext";

/** Pages only for logged-out visitors (login, register…). */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  return user ? <Navigate to={homePathFor(user)} replace /> : <>{children}</>;
}

/**
 * Protected pages. The server enforces the same rules on every API call;
 * these guards only decide which screen to show.
 */
export function RequireAuth({ children, role, onboarding = "required" }: { children: ReactNode; role?: "STUDENT" | "ADMIN"; onboarding?: "required" | "pending" }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to={homePathFor(user)} replace />;
  if (user.role === "STUDENT") {
    if (onboarding === "required" && !user.onboardingCompleted) return <Navigate to="/onboarding" replace />;
    if (onboarding === "pending" && user.onboardingCompleted) return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}

export function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <PageLoading />;
  return <Navigate to={user ? homePathFor(user) : "/login"} replace />;
}

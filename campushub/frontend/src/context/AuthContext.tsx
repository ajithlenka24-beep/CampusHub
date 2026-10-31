import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, onUnauthorized } from "../services/api";
import type { User } from "../types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: me } = await api.get<{ user: User | null }>("/auth/session");
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, []);

  useEffect(() => {
    // session expired / logged out elsewhere → drop the user so guards redirect to /login
    onUnauthorized(() => setUser(null));
    api
      .csrf()
      .catch(() => undefined)
      .then(refresh)
      .finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, rememberMe: boolean) => {
    const { user: me } = await api.post<{ user: User }>("/auth/login", { email, password, rememberMe });
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, setUser }), [user, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Where a user belongs after login. */
export const homePathFor = (user: User) => (user.role === "ADMIN" ? "/admin" : user.onboardingCompleted ? "/dashboard" : "/onboarding");

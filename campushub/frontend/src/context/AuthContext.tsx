import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api, onAccountChanged, onUnauthorized, setExpectedUser } from "../services/api";
import type { User } from "../types";
import { useToast } from "./ToastContext";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe: boolean) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<User | null>;
  setUser: (user: User | null) => void;
}

const AuthContext = createContext<AuthState | null>(null);

/** Other tabs of this browser are told when someone logs in or out, so they never show a stale account. */
const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("campushub-session") : null;
const announceSessionChange = () => {
  try {
    channel?.postMessage("session-changed");
  } catch {
    /* ignore */
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const currentId = useRef<string | null>(null);
  const lastCheck = useRef(0);

  /**
   * Every change of account goes through here. The API client learns the new account id
   * immediately (before any page renders), so each request is tagged with the account the
   * screen shows and the server can refuse requests from a stale tab.
   */
  const setUser = useCallback((next: User | null) => {
    currentId.current = next?.id ?? null;
    setExpectedUser(currentId.current);
    setUserState(next);
  }, []);

  const refresh = useCallback(async () => {
    lastCheck.current = Date.now();
    try {
      const { user: me } = await api.get<{ user: User | null }>("/auth/session");
      setUser(me);
      return me;
    } catch {
      setUser(null);
      return null;
    }
  }, [setUser]);

  /** Re-reads the session and reports whether it now belongs to a different account. */
  const resync = useCallback(async () => {
    const before = currentId.current;
    const me = await refresh();
    return (me?.id ?? null) !== before;
  }, [refresh]);

  useEffect(() => {
    // session expired / logged out elsewhere → drop the user so guards redirect to /login
    onUnauthorized(() => setUser(null));
    // another tab signed in as someone else → switch this tab to that account
    let switching = false;
    onAccountChanged(() => {
      if (switching) return;
      switching = true;
      resync()
        .then((changed) => changed && toast("Your account changed in another tab, so this page was reloaded.", "info"))
        .finally(() => {
          switching = false;
        });
    });
  }, [resync, setUser, toast]);

  // first load: get a CSRF token, then ask the server who (if anyone) is signed in
  useEffect(() => {
    api
      .csrf()
      .catch(() => undefined)
      .then(refresh)
      .finally(() => setLoading(false));
  }, [refresh]);

  // keep every open tab on the same account
  useEffect(() => {
    if (!channel) return;
    const onMessage = () => void resync();
    channel.addEventListener("message", onMessage);
    return () => channel.removeEventListener("message", onMessage);
  }, [resync]);

  // when a tab comes back into view, quietly confirm it still shows the signed-in account
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && Date.now() - lastCheck.current > 10_000) void resync();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [resync]);

  const login = useCallback(
    async (email: string, password: string, rememberMe: boolean) => {
      const { user: me } = await api.post<{ user: User }>("/auth/login", { email, password, rememberMe });
      setUser(me);
      lastCheck.current = Date.now();
      announceSessionChange();
      return me;
    },
    [setUser],
  );

  const logout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setUser(null);
      announceSessionChange();
    }
  }, [setUser]);

  const value = useMemo(() => ({ user, loading, login, logout, refresh, setUser }), [user, loading, login, logout, refresh, setUser]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** Where a user belongs after login. */
export const homePathFor = (user: User) => (user.role === "ADMIN" ? "/admin" : user.onboardingCompleted ? "/dashboard" : "/onboarding");

/**
 * After login, a student may return to the page they were sent away from, but only to
 * general pages. Pages that belong to a specific person or team (e.g. /teams/<id>) are
 * never reopened, because the previous visitor of this browser may have been someone else.
 */
const RETURNABLE = [/^\/dashboard$/, /^\/profile$/, /^\/opportunities$/, /^\/opportunities\/[0-9a-f-]{36}$/, /^\/applications$/, /^\/teams$/, /^\/career$/, /^\/assistant$/];
export const safeReturnPath = (user: User, from: unknown) =>
  user.role === "STUDENT" && user.onboardingCompleted && typeof from === "string" && RETURNABLE.some((r) => r.test(from)) ? from : homePathFor(user);

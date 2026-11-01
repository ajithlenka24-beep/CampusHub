/**
 * Small fetch wrapper for the CampusHub API.
 * - sends cookies (the session lives in an HTTP-only cookie the browser manages)
 * - adds the CSRF header to every state-changing request
 * - tells the server which account this tab is showing, so a tab never acts on a
 *   different account after someone switches accounts in another tab
 * - turns error responses into ApiError with per-field messages
 *
 * By default the API is on the same origin (/api). For a separately hosted API, build
 * the frontend with VITE_API_URL=https://api.example.com (see README → Deployment).
 */
export interface FieldError {
  path: string;
  message: string;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "ERROR",
    public readonly details: FieldError[] = [],
  ) {
    super(message);
  }

  /** { email: "Enter a valid email address.", ... } for highlighting form fields. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.details.map((d) => [d.path, d.message]));
  }
}

const API_BASE = String(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

/** Absolute URL for files served by the API (uploaded images: /uploads/...). */
export const assetUrl = (url: string | null | undefined) => (url && url.startsWith("/uploads/") ? `${API_BASE}${url}` : url ?? null);

let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: () => void) => {
  unauthorizedHandler = handler;
};

let accountChangedHandler: (() => void) | null = null;
export const onAccountChanged = (handler: () => void) => {
  accountChangedHandler = handler;
};

/** Id of the account this tab is showing (null when logged out). Set by AuthContext. */
let expectedUserId: string | null = null;
export const setExpectedUser = (id: string | null) => {
  expectedUserId = id;
};

// Requests that work without (or before) a known account never carry the account header.
const ACCOUNT_FREE = /^\/auth\/(csrf|session|login|logout|register|forgot-password|reset-password|verify-email|resend-verification)\b/;

/** The CSRF token comes from the server's response body (works even when the API is on another domain). */
let csrfToken: string | null = null;

async function ensureCsrf(force = false) {
  if (csrfToken && !force) return;
  const response = await fetch(`${API_BASE}/api/auth/csrf`, { credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (typeof data?.csrfToken === "string") csrfToken = data.csrfToken;
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    await ensureCsrf();
    headers["X-CSRF-Token"] = csrfToken ?? "";
  }
  if (expectedUserId && !ACCOUNT_FREE.test(path)) headers["X-CampusHub-User"] = expectedUserId;
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method,
      headers,
      credentials: "include",
      cache: "no-store",
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the CampusHub server. Check your connection and try again.", "NETWORK_ERROR");
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  // login and logout rotate the CSRF token and return the new one
  if (path.startsWith("/auth/") && typeof data?.csrfToken === "string") csrfToken = data.csrfToken;
  if (!response.ok) {
    const err = data?.error ?? {};
    // the CSRF token may have rotated (e.g. after a login in another tab); fetch a fresh one once
    if (response.status === 403 && err.code === "CSRF_FAILED" && retry) {
      await ensureCsrf(true);
      return request<T>(method, path, body, false);
    }
    if (response.status === 409 && err.code === "ACCOUNT_CHANGED") accountChangedHandler?.();
    if (response.status === 401 && !path.startsWith("/auth/")) unauthorizedHandler?.();
    throw new ApiError(response.status, err.message ?? "Something went wrong.", err.code, err.details ?? []);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>("PATCH", path, body ?? {}),
  del: <T = void>(path: string) => request<T>("DELETE", path),
  upload: <T>(path: string, file: File, field = "image") => {
    const form = new FormData();
    form.append(field, file);
    return request<T>("POST", path, form);
  },
  csrf: () => ensureCsrf(true),
};

export const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Something went wrong.");

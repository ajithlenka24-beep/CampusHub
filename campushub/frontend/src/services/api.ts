/**
 * Small fetch wrapper for the CampusHub API.
 * - sends cookies (the session lives in an HTTP-only cookie the browser manages)
 * - adds the CSRF header to every state-changing request
 * - turns error responses into ApiError with per-field messages
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

let unauthorizedHandler: (() => void) | null = null;
export const onUnauthorized = (handler: () => void) => {
  unauthorizedHandler = handler;
};

const readCookie = (name: string) =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${name}=`))
    ?.split("=")[1];

async function ensureCsrf(force = false) {
  if (!force && readCookie("ch_csrf")) return;
  await fetch("/api/auth/csrf", { credentials: "include" });
}

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function request<T>(method: Method, path: string, body?: unknown, retry = true): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET") {
    await ensureCsrf();
    headers["X-CSRF-Token"] = decodeURIComponent(readCookie("ch_csrf") ?? "");
  }
  const isForm = body instanceof FormData;
  if (body !== undefined && !isForm) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "Cannot reach the CampusHub server. Check that the backend is running.", "NETWORK_ERROR");
  }

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = data?.error ?? {};
    // the CSRF cookie may have rotated (e.g. after login); fetch a fresh one once
    if (response.status === 403 && err.code === "CSRF_FAILED" && retry) {
      await ensureCsrf(true);
      return request<T>(method, path, body, false);
    }
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

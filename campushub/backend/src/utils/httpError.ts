export interface FieldError {
  path: string;
  message: string;
}

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code = "ERROR",
    public readonly details?: FieldError[],
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, details?: FieldError[]) => new HttpError(400, message, "BAD_REQUEST", details);
export const unauthorized = (message = "Please log in to continue.") => new HttpError(401, message, "UNAUTHORIZED");
export const forbidden = (message = "You do not have permission to do that.", code = "FORBIDDEN") => new HttpError(403, message, code);
export const notFound = (message = "Not found.") => new HttpError(404, message, "NOT_FOUND");
export const conflict = (message: string, code = "CONFLICT") => new HttpError(409, message, code);

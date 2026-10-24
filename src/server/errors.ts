export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = "invalid_request") => new HttpError(400, code, message);
export const unauthorized = (message = "Sign in with your NEAR wallet to continue.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "You do not have permission for this action.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Not found.") => new HttpError(404, "not_found", message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { sessionFromToken, type Session } from "./auth";
import { config } from "./config";
import { HttpError, badRequest, unauthorized } from "./errors";

type Context<P> = { params: Promise<P> };
type Handler<P> = (request: NextRequest, params: P) => Promise<unknown>;

const MAX_BODY_BYTES = 32 * 1024;
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Wraps a route handler with the cross-cutting rules every Scrim endpoint follows:
// JSON-only bodies with a size cap, same-origin checks for browser mutations, and
// errors that never leak internals.
export function route<P = Record<string, never>>(handler: Handler<P>, options: { browser?: boolean } = { browser: true }) {
  return async (request: NextRequest, context: Context<P>) => {
    try {
      if (MUTATING.has(request.method)) {
        if (options.browser !== false) assertSameOrigin(request);
        const length = Number(request.headers.get("content-length") ?? 0);
        if (length > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large", "Request body is too large.");
      }
      const result = await handler(request, await context.params);
      if (result instanceof NextResponse) return withNoStore(result);
      return withNoStore(NextResponse.json(result ?? { ok: true }));
    } catch (error) {
      if (error instanceof HttpError) {
        return withNoStore(NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.status }));
      }
      console.error(`[api] ${request.method} ${request.nextUrl.pathname}`, error);
      return withNoStore(NextResponse.json({ error: { code: "internal", message: "Something went wrong. Try again." } }, { status: 500 }));
    }
  };
}

function withNoStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function assertSameOrigin(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new HttpError(415, "unsupported_media_type", "Send JSON with Content-Type: application/json.");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) throw new HttpError(403, "cross_origin", "Cross-origin requests are not allowed.");
}

export async function readJson<T = Record<string, unknown>>(request: NextRequest): Promise<T> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new HttpError(413, "payload_too_large", "Request body is too large.");
  if (!text) return {} as T;
  try {
    const value = JSON.parse(text);
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as T;
  } catch {
    throw badRequest("Body must be a JSON object.");
  }
}

export async function currentSession(): Promise<Session | null> {
  const jar = await cookies();
  return sessionFromToken(jar.get(config.sessionCookie)?.value);
}

export async function requireSession(): Promise<Session> {
  const session = await currentSession();
  if (!session) throw unauthorized();
  return session;
}

export function sessionCookie(token: string, maxAge = config.sessionTtlSeconds) {
  return {
    name: config.sessionCookie,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

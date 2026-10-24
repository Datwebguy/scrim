import { sql } from "./db";
import { HttpError } from "./errors";

// Each route group gets a request budget per client per minute. Stricter groups sit first.
const LIMITS: [prefix: string, perMinute: number][] = [
  ["/api/v1/auth", 20],
  ["/api/v1/private/unlock", 20],
  ["/api/v1/accounts", 30],
  ["/api/v1/pay", 60],
  ["/api/v1/proofs/state", 120],
  ["/api/v1/agent", 120],
  ["/api/mcp", 120],
];
const DEFAULT_PER_MINUTE = 300;

export function limitFor(pathname: string): { group: string; perMinute: number } {
  const hit = LIMITS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? { group: hit[0], perMinute: hit[1] } : { group: "default", perMinute: DEFAULT_PER_MINUTE };
}

function clientId(headers: Headers): string {
  // Vercel sets x-vercel-forwarded-for and x-real-ip itself, so a client can't fake them there.
  return headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip")?.trim() || headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Counts this request. Throws 429 when the client is over budget. If the database is unreachable,
// the request goes through: the real work will fail on its own, and a counter should never take the site down.
export async function rateLimit(headers: Headers, pathname: string, now = Date.now()) {
  const { group, perMinute } = limitFor(pathname);
  const window = Math.floor(now / 60_000);
  let hits: number;
  try {
    const [row] = await sql<{ hits: number }[]>`
      INSERT INTO rate_limits (key, window_start, hits) VALUES (${`${clientId(headers)}|${group}`}, ${window}, 1)
      ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
      RETURNING hits`;
    hits = row.hits;
    if (Math.random() < 0.01) void sql`DELETE FROM rate_limits WHERE window_start < ${window - 10}`.catch(() => {});
  } catch (error) {
    console.error("[rate-limit]", error);
    return;
  }
  if (hits > perMinute) throw new HttpError(429, "rate_limited", "Too many requests. Wait a minute and try again.");
}

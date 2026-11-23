// AI apps a person connects to their own Scrim account: Claude, ChatGPT, Codex, Cursor, VS Code, Grok,
// Hermes Agent, bots and scripts. Apps that can sign people in use OAuth (they register, the person approves
// on /app/connect, the app swaps a one-time code for its own session). Apps that can't use a personal key
// the person makes on the same page. Either way the app gets a session of its own that only the MCP server
// accepts, which the person can disconnect at any time.
import { randomBytes, randomUUID } from "node:crypto";
import { isAllowedRedirect, isChallenge, pkceMatches, redirectWith } from "@/protocol/oauth";
import { audit } from "./audit";
import { hashToken, type Session } from "./auth";
import { sql } from "./db";
import { HttpError, notFound } from "./errors";
import { sharePrivateAccess } from "./private-access";

const CONNECTOR_TTL_SECONDS = 30 * 24 * 60 * 60;
const KEY_TTL_SECONDS = 90 * 24 * 60 * 60;
const CODE_TTL_SECONDS = 5 * 60;
const PERSONAL_KEY_PREFIX = "scrim_pk_";

export class OAuthError extends HttpError {
  constructor(readonly oauthCode: string, message: string, status = 400) {
    super(status, oauthCode, message);
  }
}

type Client = { id: string; name: string; redirectUris: string[] };

const cleanName = (value: unknown, fallback: string) => {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f<>]/g, "").trim() : "";
  return (text || fallback).slice(0, 60);
};

// RFC 7591 dynamic registration. Public clients only: no secrets, PKCE required.
export async function registerClient(body: Record<string, unknown>) {
  const uris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  if (uris.length === 0 || uris.length > 5) throw new OAuthError("invalid_redirect_uri", "Send between one and five redirect_uris.");
  for (const uri of uris) if (!isAllowedRedirect(String(uri))) throw new OAuthError("invalid_redirect_uri", "Each redirect_uri must be https, or http on localhost.");
  const id = `scl_${randomBytes(16).toString("base64url")}`;
  const name = cleanName(body.client_name, "AI app");
  await sql`INSERT INTO oauth_clients (id, name, redirect_uris) VALUES (${id}, ${name}, ${sql.json(uris.map(String))})`;
  return {
    client_id: id, client_name: name, redirect_uris: uris.map(String), client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code"], response_types: ["code"], token_endpoint_auth_method: "none",
  };
}

async function client(id: string): Promise<Client | null> {
  const [row] = await sql<{ id: string; name: string; redirect_uris: string[] }[]>`SELECT id, name, redirect_uris FROM oauth_clients WHERE id = ${id}`;
  return row ? { id: row.id, name: row.name, redirectUris: row.redirect_uris } : null;
}

export type AuthorizeRequest = { client: Client; redirectUri: string; codeChallenge: string; state?: string };

// Checks the request an app sends people to /app/connect with. Errors before the redirect address is known
// are shown on the page; the rest go back to the app.
export async function readAuthorizeRequest(params: Record<string, string | undefined>): Promise<AuthorizeRequest> {
  const found = params.client_id ? await client(params.client_id) : null;
  if (!found) throw new OAuthError("invalid_client", "This app isn't registered with Scrim. Try connecting again from the app.");
  const redirectUri = params.redirect_uri ?? (found.redirectUris.length === 1 ? found.redirectUris[0] : "");
  if (!found.redirectUris.includes(redirectUri)) throw new OAuthError("invalid_request", "This app asked to return to an address it didn't register.");
  if (params.response_type !== "code") throw new OAuthError("unsupported_response_type", "Only response_type=code is supported.");
  if (params.code_challenge_method !== "S256" || !isChallenge(params.code_challenge)) throw new OAuthError("invalid_request", "PKCE with S256 is required.");
  return { client: found, redirectUri, codeChallenge: params.code_challenge, state: params.state };
}

export function denyRedirect(request: AuthorizeRequest) {
  return redirectWith(request.redirectUri, { error: "access_denied", state: request.state });
}

export async function approve(session: Session, params: Record<string, string | undefined>, issuer: string) {
  const request = await readAuthorizeRequest(params);
  const code = randomBytes(32).toString("base64url");
  await sql`
    INSERT INTO oauth_codes (code_hash, client_id, session_id, redirect_uri, code_challenge, expires_at)
    VALUES (${hashToken(code)}, ${request.client.id}, ${session.id}, ${request.redirectUri}, ${request.codeChallenge}, ${new Date(Date.now() + CODE_TTL_SECONDS * 1000)})`;
  return { redirect: redirectWith(request.redirectUri, { code, state: request.state, iss: issuer }) };
}

async function openSession(source: Session, clientId: string, token: string, ttlSeconds: number) {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO sessions (id, token_hash, account_id, public_key, network, expires_at, client_id)
      VALUES (${id}, ${hashToken(token)}, ${source.accountId}, ${source.publicKey}, ${source.network}, ${expiresAt}, ${clientId})`;
    await audit(tx, null, { type: "human", id: source.accountId }, "connector.connected", id, { clientId });
  });
  const session: Session = { id, accountId: source.accountId, publicKey: source.publicKey, network: source.network, expiresAt };
  await sharePrivateAccess(session, source).catch((e) => console.error("[connectors] private access not shared", e));
  return session;
}

// The token endpoint: a one-time code plus the PKCE verifier becomes the app's own session.
export async function exchangeCode(body: Record<string, string | undefined>) {
  if (body.grant_type !== "authorization_code") throw new OAuthError("unsupported_grant_type", "Only authorization_code is supported.");
  if (!body.code || !body.code_verifier) throw new OAuthError("invalid_request", "Send code and code_verifier.");
  const [row] = await sql<{ client_id: string; session_id: string; redirect_uri: string; code_challenge: string }[]>`
    UPDATE oauth_codes SET used_at = now()
    WHERE code_hash = ${hashToken(body.code)} AND used_at IS NULL AND expires_at > now()
    RETURNING client_id, session_id, redirect_uri, code_challenge`;
  if (!row) throw new OAuthError("invalid_grant", "This code is expired or was already used.");
  if ((body.client_id && body.client_id !== row.client_id) || (body.redirect_uri && body.redirect_uri !== row.redirect_uri)) throw new OAuthError("invalid_grant", "This code was issued to another app.");
  if (!pkceMatches(body.code_verifier, row.code_challenge)) throw new OAuthError("invalid_grant", "The code_verifier doesn't match.");
  const [source] = await sql<{ id: string; account_id: string; public_key: string; network: string; expires_at: Date }[]>`
    SELECT id, account_id, public_key, network, expires_at FROM sessions WHERE id = ${row.session_id} AND revoked_at IS NULL`;
  if (!source) throw new OAuthError("invalid_grant", "You signed out before the app finished connecting. Connect again.");
  const token = randomBytes(32).toString("base64url");
  await openSession({ id: source.id, accountId: source.account_id, publicKey: source.public_key, network: source.network as Session["network"], expiresAt: source.expires_at }, row.client_id, token, CONNECTOR_TTL_SECONDS);
  return { access_token: token, token_type: "Bearer", expires_in: CONNECTOR_TTL_SECONDS, scope: "scrim" };
}

// For agents that can't sign people in (Hermes Agent, Grok, bots, scripts): a key made by the person, shown once.
export async function createPersonalKey(session: Session, name: unknown) {
  const clientId = `spk_${randomBytes(12).toString("base64url")}`;
  const label = cleanName(name, "My agent");
  await sql`INSERT INTO oauth_clients (id, name, redirect_uris) VALUES (${clientId}, ${label}, ${sql.json([])})`;
  const key = `${PERSONAL_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
  const created = await openSession(session, clientId, key, KEY_TTL_SECONDS);
  return { id: created.id, name: label, key, expiresAt: created.expiresAt };
}

export async function listConnectors(session: Session) {
  const rows = await sql<{ id: string; name: string; personal: boolean; created_at: Date; expires_at: Date }[]>`
    SELECT s.id, c.name, (c.id LIKE 'spk_%') AS personal, s.created_at, s.expires_at
    FROM sessions s JOIN oauth_clients c ON c.id = s.client_id
    WHERE s.account_id = ${session.accountId} AND s.network = ${session.network} AND s.revoked_at IS NULL AND s.expires_at > now()
    ORDER BY s.created_at DESC`;
  return rows.map((r) => ({ id: r.id, name: r.name, kind: r.personal ? "key" : "app", connectedAt: r.created_at, expiresAt: r.expires_at }));
}

export async function disconnect(session: Session, id: string) {
  const done = await sql`
    UPDATE sessions SET revoked_at = now()
    WHERE id = ${id} AND account_id = ${session.accountId} AND client_id IS NOT NULL AND revoked_at IS NULL RETURNING id`;
  if (done.length === 0) throw notFound("That app isn't connected.");
  await audit(sql, null, { type: "human", id: session.accountId }, "connector.disconnected", id);
}

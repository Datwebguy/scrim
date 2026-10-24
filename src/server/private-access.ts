// Access to a person's private balance. The wallet signs an ownership message once; NEAR Intents
// returns a session token that can read that person's private balance and nothing more. Scrim keeps
// the token sealed, tied to the browser session, and never sends it to the browser.
import bs58 from "bs58";
import { decodeSignature } from "@/protocol/nep413";
import { INTENTS_CONTRACT } from "@/protocol/intents-auth";
import type { Session } from "./auth";
import { PRIVATE_MONEY_MAINNET_ONLY } from "@/protocol/networks";
import { sql } from "./db";
import { HttpError } from "./errors";
import { intentsChain } from "./near-rpc";
import { authenticate, refresh, UpstreamError } from "./oneclick";
import { open, seal } from "./secrets";

export type PrivateStatus = "active" | "needs_setup" | "unavailable" | "expired" | "none" | "mainnet_only";

type Tokens = { accessToken: string; refreshToken: string };
type Row = { status: PrivateStatus; tokens_sealed: string | null; access_expires_at: Date | null; refresh_expires_at: Date | null; public_key: string; detail: string | null };

export type SignedOwnership = { message: string; nonce: string; publicKey: string; signature: string };

const aad = (session: Session) => `private_access:${session.id}:${session.accountId}`;

export function toIntentsSignature(signature: string): string {
  return `ed25519:${bs58.encode(decodeSignature(signature))}`;
}

async function save(session: Session, publicKey: string, status: PrivateStatus, extra: { tokens?: Tokens; accessExpiresAt?: Date; refreshExpiresAt?: Date; detail?: string } = {}) {
  const sealed = extra.tokens ? seal(extra.tokens, aad(session)) : null;
  await sql`
    INSERT INTO private_access (session_id, account_id, public_key, status, tokens_sealed, access_expires_at, refresh_expires_at, detail, updated_at)
    VALUES (${session.id}, ${session.accountId}, ${publicKey}, ${status}, ${sealed}, ${extra.accessExpiresAt ?? null}, ${extra.refreshExpiresAt ?? null}, ${extra.detail ?? null}, now())
    ON CONFLICT (session_id) DO UPDATE SET public_key = EXCLUDED.public_key, status = EXCLUDED.status,
      tokens_sealed = EXCLUDED.tokens_sealed, access_expires_at = EXCLUDED.access_expires_at,
      refresh_expires_at = EXCLUDED.refresh_expires_at, detail = EXCLUDED.detail, updated_at = now()`;
}

// Called with a signature the server has already verified against a single-use challenge.
export async function connectPrivateBalance(session: Session, signed: SignedOwnership): Promise<PrivateStatus> {
  if (session.network !== "mainnet") return "mainnet_only";
  try {
    if (!(await intentsChain.hasPublicKey(session.accountId, signed.publicKey))) {
      await save(session, signed.publicKey, "needs_setup");
      return "needs_setup";
    }
    const tokens = await authenticate({
      standard: "nep413",
      payload: { message: signed.message, nonce: signed.nonce, recipient: INTENTS_CONTRACT },
      public_key: signed.publicKey,
      signature: toIntentsSignature(signed.signature),
    });
    await save(session, signed.publicKey, "active", {
      tokens: { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken },
      accessExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      refreshExpiresAt: new Date(Date.now() + tokens.refreshExpiresIn * 1000),
    });
    return "active";
  } catch (error) {
    const detail = error instanceof HttpError ? error.message : "Could not reach the private network.";
    console.error("[private-access] connect failed", detail);
    await save(session, signed.publicKey, "unavailable", { detail });
    return "unavailable";
  }
}

export async function privateStatus(session: Session): Promise<{ status: PrivateStatus; publicKey: string | null; detail: string | null }> {
  if (session.network !== "mainnet") return { status: "mainnet_only", publicKey: session.publicKey, detail: PRIVATE_MONEY_MAINNET_ONLY };
  const [row] = await sql<Row[]>`SELECT status, tokens_sealed, access_expires_at, refresh_expires_at, public_key, detail FROM private_access WHERE session_id = ${session.id}`;
  if (!row) return { status: "none", publicKey: null, detail: null };
  if (row.status === "active" && row.refresh_expires_at && row.refresh_expires_at < new Date()) return { status: "expired", publicKey: row.public_key, detail: null };
  return { status: row.status, publicKey: row.public_key, detail: row.detail };
}

// Returns a valid access token, refreshing it when it is about to expire.
export async function privateAccessToken(session: Session): Promise<string> {
  const [row] = await sql<Row[]>`SELECT status, tokens_sealed, access_expires_at, refresh_expires_at, public_key, detail FROM private_access WHERE session_id = ${session.id}`;
  if (!row || row.status !== "active" || !row.tokens_sealed) {
    throw new HttpError(409, "private_access_required", "Unlock your private balance first.");
  }
  const tokens = open<Tokens>(row.tokens_sealed, aad(session));
  if (row.access_expires_at && row.access_expires_at.getTime() - Date.now() > 60_000) return tokens.accessToken;
  try {
    const next = await refresh(tokens.refreshToken);
    await save(session, row.public_key, "active", {
      tokens: { accessToken: next.accessToken, refreshToken: tokens.refreshToken },
      accessExpiresAt: new Date(Date.now() + next.expiresIn * 1000),
      refreshExpiresAt: row.refresh_expires_at ?? undefined,
    });
    return next.accessToken;
  } catch (error) {
    if (error instanceof UpstreamError && error.upstreamStatus < 500) {
      await save(session, row.public_key, "expired");
      throw new HttpError(409, "private_access_required", "Your private session ended. Unlock your balance again.");
    }
    throw error;
  }
}

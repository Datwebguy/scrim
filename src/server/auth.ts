import { randomBytes, randomUUID, createHash } from "node:crypto";
import { normalizeNearAccount } from "@/protocol/identifiers";
import { verifyNep413 } from "@/protocol/nep413";
import { audit } from "./audit";
import { config } from "./config";
import { sql, type Tx } from "./db";
import { badRequest, unauthorized } from "./errors";
import { keyVerifier } from "./near-rpc";

export type Session = { id: string; accountId: string; publicKey: string; network: string; expiresAt: Date };

export type IssuedChallenge = { challengeId: string; message: string; nonce: string; recipient: string; expiresAt: string };

export type SignedEnvelope = { challengeId: string; accountId: string; publicKey: string; signature: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export async function issueChallenge(
  tx: Tx,
  input: { purpose: "sign_in" | "approve_payment"; lines: string[]; subject?: string; sessionId?: string },
): Promise<IssuedChallenge> {
  const id = randomUUID();
  const nonce = randomBytes(32);
  const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);
  const message = [...input.lines, "", `Network: ${config.network}`, `Challenge: ${id}`, `Expires: ${expiresAt.toISOString()}`].join("\n");
  await tx`
    INSERT INTO auth_challenges (id, purpose, subject, message, nonce, recipient, session_id, expires_at)
    VALUES (${id}, ${input.purpose}, ${input.subject ?? null}, ${message}, ${nonce}, ${config.authRecipient}, ${input.sessionId ?? null}, ${expiresAt})`;
  return { challengeId: id, message, nonce: nonce.toString("base64"), recipient: config.authRecipient, expiresAt: expiresAt.toISOString() };
}

export function createSignInChallenge() {
  return issueChallenge(sql, { purpose: "sign_in", lines: ["Sign in to Scrim", "", "This signature proves you control this NEAR account. It does not authorize any transaction or move funds."] });
}

// Verifies a wallet-signed NEP-413 envelope against a stored challenge and consumes it.
// Every check fails closed; the challenge can be consumed exactly once.
export async function consumeSignedChallenge(
  tx: Tx,
  envelope: SignedEnvelope,
  expect: { purpose: "sign_in" | "approve_payment"; subject?: string; sessionId?: string },
): Promise<{ accountId: string; publicKey: string; challengeId: string }> {
  const accountId = normalizeNearAccount(envelope.accountId ?? "");
  if (!accountId) throw badRequest("Invalid NEAR account ID.");
  const [challenge] = await tx<{ id: string; purpose: string; subject: string | null; message: string; nonce: Buffer; recipient: string; session_id: string | null }[]>`
    SELECT id, purpose, subject, message, nonce, recipient, session_id FROM auth_challenges
    WHERE id = ${envelope.challengeId} AND consumed_at IS NULL AND expires_at > now()
    FOR UPDATE`;
  if (!challenge) throw unauthorized("This signature request has expired or was already used. Try again.");
  if (challenge.purpose !== expect.purpose) throw unauthorized("Signature was issued for a different action.");
  if (expect.subject !== undefined && challenge.subject !== expect.subject) throw unauthorized("Signature does not match this request.");
  if (expect.sessionId !== undefined && challenge.session_id !== expect.sessionId) throw unauthorized("Signature was requested by a different session.");

  const valid = verifyNep413(
    { message: challenge.message, nonce: new Uint8Array(challenge.nonce), recipient: challenge.recipient },
    envelope.publicKey,
    envelope.signature,
  );
  if (!valid) throw unauthorized("Signature verification failed.");
  if (!(await keyVerifier()(accountId, envelope.publicKey))) {
    throw unauthorized("That key is not a full-access key on this account.");
  }

  const consumed = await tx`UPDATE auth_challenges SET consumed_at = now() WHERE id = ${challenge.id} AND consumed_at IS NULL RETURNING id`;
  if (consumed.length !== 1) throw unauthorized("This signature request was already used.");
  return { accountId, publicKey: envelope.publicKey, challengeId: challenge.id };
}

export async function signIn(envelope: SignedEnvelope): Promise<{ token: string; session: Session }> {
  return sql.begin(async (tx) => {
    const { accountId, publicKey } = await consumeSignedChallenge(tx, envelope, { purpose: "sign_in" });
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
    await tx`
      INSERT INTO sessions (id, token_hash, account_id, public_key, network, expires_at)
      VALUES (${id}, ${hashToken(token)}, ${accountId}, ${publicKey}, ${config.network}, ${expiresAt})`;
    await audit(tx, null, { type: "human", id: accountId }, "session.created", id, { network: config.network });
    return { token, session: { id, accountId, publicKey, network: config.network, expiresAt } };
  });
}

export async function sessionFromToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [row] = await sql<{ id: string; account_id: string; public_key: string; network: string; expires_at: Date }[]>`
    SELECT id, account_id, public_key, network, expires_at FROM sessions
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL AND expires_at > now()`;
  if (!row || row.network !== config.network) return null;
  return { id: row.id, accountId: row.account_id, publicKey: row.public_key, network: row.network, expiresAt: row.expires_at };
}

export async function revokeSession(token: string) {
  await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

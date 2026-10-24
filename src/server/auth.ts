import { randomBytes, randomUUID, createHash } from "node:crypto";
import { INTENTS_CONTRACT, ownershipMessage, versionedNonce } from "@/protocol/intents-auth";
import { normalizeNearAccount } from "@/protocol/identifiers";
import { verifyNep413 } from "@/protocol/nep413";
import { isNetwork, type Network } from "@/protocol/networks";
import { audit } from "./audit";
import { config } from "./config";
import { sql, type Tx } from "./db";
import { badRequest, unauthorized } from "./errors";
import { intentsChain, verifyAccountKey } from "./near-rpc";
import { connectPrivateBalance, type PrivateStatus } from "./private-access";

export type Session = { id: string; accountId: string; publicKey: string; network: Network; expiresAt: Date };

export type IssuedChallenge = { challengeId: string; message: string; nonce: string; recipient: string; expiresAt: string };

type Purpose = "sign_in" | "approve_payment" | "private_access";

export type SignedEnvelope = { challengeId: string; accountId: string; publicKey: string; signature: string };

const hashToken = (token: string) => createHash("sha256").update(token).digest();

export async function issueChallenge(
  tx: Tx,
  input: { purpose: Purpose; network: Network; lines: string[]; subject?: string; sessionId?: string },
): Promise<IssuedChallenge> {
  const id = randomUUID();
  const nonce = randomBytes(32);
  const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);
  const message = [...input.lines, "", `Network: ${input.network}`, `Challenge: ${id}`, `Expires: ${expiresAt.toISOString()}`].join("\n");
  await tx`
    INSERT INTO auth_challenges (id, purpose, network, subject, message, nonce, recipient, session_id, expires_at)
    VALUES (${id}, ${input.purpose}, ${input.network}, ${input.subject ?? null}, ${message}, ${nonce}, ${config.authRecipient}, ${input.sessionId ?? null}, ${expiresAt})`;
  return { challengeId: id, message, nonce: nonce.toString("base64"), recipient: config.authRecipient, expiresAt: expiresAt.toISOString() };
}

// On mainnet, sign-in uses the NEAR Intents ownership message: a signed "empty intent" that cannot
// move funds. One signature both signs the person in and unlocks their private balance.
// On testnet there is no NEAR Intents, so a plain sign-in message is used.
export async function createOwnershipChallenge(
  tx: Tx,
  rawAccountId: string,
  network: Network,
  purpose: "sign_in" | "private_access" = "sign_in",
  sessionId?: string,
): Promise<IssuedChallenge> {
  const accountId = normalizeNearAccount(rawAccountId);
  if (!accountId) throw badRequest("Invalid NEAR account ID.");
  if (!config.enabledNetworks.includes(network)) throw badRequest(`${network} is not available here.`);
  if (network === "testnet") {
    return issueChallenge(tx, {
      purpose: "sign_in", network, subject: accountId, sessionId,
      lines: ["Sign in to Scrim", "", `Account: ${accountId}`, "", "This signature proves you control this account. It does not move any money."],
    });
  }
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + config.challengeTtlSeconds * 1000);
  const nonce = versionedNonce(await intentsChain.currentSalt(), expiresAt);
  const message = ownershipMessage(accountId, expiresAt);
  await tx`
    INSERT INTO auth_challenges (id, purpose, network, subject, message, nonce, recipient, session_id, expires_at)
    VALUES (${id}, ${purpose}, ${network}, ${accountId}, ${message}, ${nonce}, ${INTENTS_CONTRACT}, ${sessionId ?? null}, ${expiresAt})`;
  return { challengeId: id, message, nonce: nonce.toString("base64"), recipient: INTENTS_CONTRACT, expiresAt: expiresAt.toISOString() };
}

export function createSignInChallenge(accountId: string, network: Network) {
  return createOwnershipChallenge(sql, accountId, network);
}

// Verifies a wallet-signed NEP-413 envelope against a stored challenge and consumes it.
// Every check fails closed; the challenge can be consumed exactly once.
export async function consumeSignedChallenge(
  tx: Tx,
  envelope: SignedEnvelope,
  expect: { purpose: Purpose; subject?: string; sessionId?: string; network?: Network },
): Promise<{ accountId: string; publicKey: string; challengeId: string; message: string; nonce: string; network: Network }> {
  const accountId = normalizeNearAccount(envelope.accountId ?? "");
  if (!accountId) throw badRequest("Invalid NEAR account ID.");
  const [challenge] = await tx<{ id: string; purpose: string; network: string; subject: string | null; message: string; nonce: Buffer; recipient: string; session_id: string | null }[]>`
    SELECT id, purpose, network, subject, message, nonce, recipient, session_id FROM auth_challenges
    WHERE id = ${envelope.challengeId} AND consumed_at IS NULL AND expires_at > now()
    FOR UPDATE`;
  if (!challenge) throw unauthorized("This signature request has expired or was already used. Try again.");
  if (!isNetwork(challenge.network)) throw unauthorized("Unknown network.");
  if (expect.network !== undefined && challenge.network !== expect.network) throw unauthorized("Signature was issued for a different network.");
  if (challenge.purpose !== expect.purpose) throw unauthorized("Signature was issued for a different action.");
  if (expect.subject !== undefined && challenge.subject !== expect.subject) throw unauthorized("Signature does not match this request.");
  if (expect.purpose !== "approve_payment" && challenge.subject !== accountId) throw unauthorized("Signature was requested for a different account.");
  if (expect.sessionId !== undefined && challenge.session_id !== expect.sessionId) throw unauthorized("Signature was requested by a different session.");

  const valid = verifyNep413(
    { message: challenge.message, nonce: new Uint8Array(challenge.nonce), recipient: challenge.recipient },
    envelope.publicKey,
    envelope.signature,
  );
  if (!valid) throw unauthorized("Signature verification failed.");
  if (!(await verifyAccountKey(challenge.network, accountId, envelope.publicKey))) {
    throw unauthorized("That key is not a full-access key on this account.");
  }

  const consumed = await tx`UPDATE auth_challenges SET consumed_at = now() WHERE id = ${challenge.id} AND consumed_at IS NULL RETURNING id`;
  if (consumed.length !== 1) throw unauthorized("This signature request was already used.");
  return { accountId, publicKey: envelope.publicKey, challengeId: challenge.id, message: challenge.message, nonce: challenge.nonce.toString("base64"), network: challenge.network };
}

export async function signIn(envelope: SignedEnvelope): Promise<{ token: string; session: Session; privateStatus: PrivateStatus }> {
  const { token, session, signed } = await sql.begin(async (tx) => {
    const signed = await consumeSignedChallenge(tx, envelope, { purpose: "sign_in" });
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + config.sessionTtlSeconds * 1000);
    await tx`
      INSERT INTO sessions (id, token_hash, account_id, public_key, network, expires_at)
      VALUES (${id}, ${hashToken(token)}, ${signed.accountId}, ${signed.publicKey}, ${signed.network}, ${expiresAt})`;
    await audit(tx, null, { type: "human", id: signed.accountId }, "session.created", id, { network: signed.network });
    return { token, signed, session: { id, accountId: signed.accountId, publicKey: signed.publicKey, network: signed.network, expiresAt } };
  });
  const privateStatus = await connectPrivateBalance(session, { message: signed.message, nonce: signed.nonce, publicKey: signed.publicKey, signature: envelope.signature });
  return { token, session, privateStatus };
}

// Re-unlock the private balance inside an existing session (after setup, or when access expired).
export async function reconnectPrivateBalance(session: Session, envelope: SignedEnvelope): Promise<PrivateStatus> {
  if (envelope.accountId !== session.accountId) throw unauthorized("Sign with the account you are signed in with.");
  const signed = await sql.begin((tx) => consumeSignedChallenge(tx, envelope, { purpose: "private_access", sessionId: session.id, network: session.network }));
  return connectPrivateBalance(session, { message: signed.message, nonce: signed.nonce, publicKey: signed.publicKey, signature: envelope.signature });
}

export async function sessionFromToken(token: string | undefined | null): Promise<Session | null> {
  if (!token) return null;
  const [row] = await sql<{ id: string; account_id: string; public_key: string; network: string; expires_at: Date }[]>`
    SELECT id, account_id, public_key, network, expires_at FROM sessions
    WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL AND expires_at > now()`;
  if (!row || !isNetwork(row.network) || !config.enabledNetworks.includes(row.network)) return null;
  return { id: row.id, accountId: row.account_id, publicKey: row.public_key, network: row.network, expiresAt: row.expires_at };
}

export async function revokeSession(token: string) {
  await sql`UPDATE sessions SET revoked_at = now() WHERE token_hash = ${hashToken(token)} AND revoked_at IS NULL`;
}

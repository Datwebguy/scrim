import { createHash } from "node:crypto";
import { PrivyClient } from "@privy-io/node";
import { encodePublicKey, nep413Digest, type Nep413Payload } from "@/protocol/nep413";
import type { Network } from "@/protocol/networks";
import { challengeIssuedTo, createSignInChallenge, signIn, type Session } from "./auth";
import { sql } from "./db";
import { allowedActions, broadcast, signedTransaction, type WalletAction } from "./email-send";
import { badRequest, forbidden, unauthorized } from "./errors";
import { transferIssuedTo } from "./transfers";

// Sign in with an email. Privy checks the person's login and keeps their key in split pieces. Scrim never holds the
// key. Scrim asks Privy to sign, and does so only after checking the person's live login token on every request.
//
// What this means for trust: Privy's own email login has no way to make Privy refuse Scrim's server (the "sign with
// the user's token" feature is only for apps with their own login system). So the wallet belongs to the app and
// Scrim's server is what stands between a request and a signature. Anyone who holds Scrim's Privy secret could sign.

const emailLoginEnabled = () => process.env.SCRIM_EMAIL_SIGNIN === "on" && Boolean(process.env.PRIVY_APP_ID && process.env.PRIVY_APP_SECRET);

let client: PrivyClient | null = null;
function privy(): PrivyClient {
  if (!emailLoginEnabled()) throw badRequest("Email sign in isn't switched on here.");
  return (client ??= new PrivyClient({ appId: process.env.PRIVY_APP_ID!, appSecret: process.env.PRIVY_APP_SECRET! }));
}

export type EmailAccount = { privyUserId: string; walletId: string; accountId: string; publicKey: string };

// The Privy user a login token belongs to. Throws for anything that is not a live, valid token.
async function userFromToken(accessToken: string): Promise<string> {
  if (!accessToken || accessToken.length > 4000) throw unauthorized("Sign in with your email again.");
  try {
    return (await privy().utils().auth().verifyAccessToken(accessToken)).user_id;
  } catch {
    throw unauthorized("Your email sign in has expired. Sign in again.");
  }
}

// Privy returns a NEAR key as hex with a one byte curve prefix. NEAR's implicit account is the hex of the key itself.
function describe(wallet: { id: string; address: string; public_key?: string | null }, privyUserId: string): EmailAccount {
  const hex = wallet.address.toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hex)) throw new Error("Privy returned a NEAR address in an unexpected form.");
  return { privyUserId, walletId: wallet.id, accountId: hex, publicKey: encodePublicKey(Uint8Array.from(Buffer.from(hex, "hex"))) };
}

// The NEAR account for this person: found, or made once. One person gets one account on both networks.
async function accountFor(privyUserId: string): Promise<EmailAccount> {
  const found = async () => (await sql<{ wallet_id: string; account_id: string; public_key: string }[]>`SELECT wallet_id, account_id, public_key FROM email_accounts WHERE privy_user_id = ${privyUserId}`)[0];
  const existing = await found();
  if (existing) return { privyUserId, walletId: existing.wallet_id, accountId: existing.account_id, publicKey: existing.public_key };
  return sql.begin(async (tx) => {
    // One at a time per person, so two quick sign ins never create two wallets.
    await tx`SELECT pg_advisory_xact_lock(hashtext(${privyUserId}))`;
    const again = (await tx<{ wallet_id: string; account_id: string; public_key: string }[]>`SELECT wallet_id, account_id, public_key FROM email_accounts WHERE privy_user_id = ${privyUserId}`)[0];
    if (again) return { privyUserId, walletId: again.wallet_id, accountId: again.account_id, publicKey: again.public_key };
    const externalId = `scrim-${createHash("sha256").update(privyUserId).digest("hex").slice(0, 40)}`;
    const wallet = await privy().wallets().create({ chain_type: "near", external_id: externalId }).catch(async (error: unknown) => {
      // The wallet may already exist at Privy (an earlier sign up that stopped before it was saved here): reuse it.
      if (!/external_id already exists/i.test(String((error as Error)?.message ?? error))) throw error;
      for await (const found of privy().wallets().list({ external_id: externalId })) return found;
      throw error;
    });
    const account = describe(wallet as { id: string; address: string }, privyUserId);
    await tx`INSERT INTO email_accounts (privy_user_id, wallet_id, account_id, public_key) VALUES (${privyUserId}, ${account.walletId}, ${account.accountId}, ${account.publicKey})`;
    return account;
  });
}

async function accountByLogin(accessToken: string): Promise<EmailAccount> {
  return accountFor(await userFromToken(accessToken));
}

// Signs the NEP-413 digest of a message with the person's key. The digest carries NEP-413's own prefix, so the
// signature can never be passed off as a NEAR transaction.
async function signHash(account: EmailAccount, digest: Uint8Array): Promise<Uint8Array> {
  const out = await privy().wallets().rawSign(account.walletId, { params: { hash: "0x" + Buffer.from(digest).toString("hex") } });
  const signature = Buffer.from(out.signature.replace(/^0x/, ""), "hex");
  if (signature.length !== 64) throw new Error("Privy returned a signature in an unexpected form.");
  return new Uint8Array(signature);
}

async function signMessage(account: EmailAccount, payload: Nep413Payload): Promise<{ publicKey: string; signature: string }> {
  return { publicKey: account.publicKey, signature: Buffer.from(await signHash(account, nep413Digest(payload))).toString("base64") };
}

// One call signs the person in: check the login, find their account, sign Scrim's sign in message, open a session.
export async function signInWithEmailToken(accessToken: string, network: Network) {
  const account = await accountByLogin(accessToken);
  const challenge = await createSignInChallenge(account.accountId, network);
  const { signature, publicKey } = await signMessage(account, { message: challenge.message, nonce: Uint8Array.from(Buffer.from(challenge.nonce, "base64")), recipient: challenge.recipient });
  return signIn({ challengeId: challenge.challengeId, accountId: account.accountId, publicKey, signature });
}

// For a signed in email person: signs a message Scrim asks their wallet to sign (approvals, transfers, unlocking).
export async function signForSession(session: Session, accessToken: string, payload: Nep413Payload) {
  const account = await accountByLogin(accessToken);
  if (account.accountId !== session.accountId) throw unauthorized("Sign in with the account you are using.");
  // An email account signs without a wallet window asking first, so it signs only what Scrim itself prepared for this
  // person (a sign in, an approval, an unlock or a transfer). A stolen session can't make it sign anything else.
  if (!(await challengeIssuedTo(session, payload)) && !(await transferIssuedTo(session, payload))) throw forbidden("Scrim didn't ask for this signature, so it wasn't signed.");
  return { accountId: account.accountId, ...(await signMessage(account, payload)) };
}

// For a signed in email person: sends from their own public balance. Only plain money moves are signed (see email-send.ts),
// the account is the one in the session, and the person's live login is checked on every call.
export async function sendForSession(session: Session, accessToken: string, input: { receiverId: string; actions: WalletAction[] }) {
  const account = await accountByLogin(accessToken);
  if (account.accountId !== session.accountId) throw unauthorized("Sign in with the account you are using.");
  const { receiverId, actions } = allowedActions(session.network, input.receiverId, input.actions);
  const signed = await signedTransaction(session.network, account.accountId, account.publicKey, receiverId, actions, (hash) => signHash(account, hash));
  return broadcast(session.network, signed);
}

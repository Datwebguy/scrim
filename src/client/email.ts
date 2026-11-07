"use client";
// Sign in with an email. Privy mails a code and keeps the person's key. Scrim's server asks Privy to sign, and
// Privy signs only while the person's own login token goes along. The key never reaches this page or Scrim.
import type { Network } from "@/protocol/networks";
import { api } from "./api";

const KEY = "scrim-email-session";
type Privy = InstanceType<typeof import("@privy-io/js-sdk-core").default>;
let privyPromise: Promise<Privy> | null = null;

// Off until it is switched on with NEXT_PUBLIC_EMAIL_SIGNIN=on (and the matching SCRIM_EMAIL_SIGNIN=on on the server).
export const emailSignInAvailable = process.env.NEXT_PUBLIC_EMAIL_SIGNIN === "on" && Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);

function privy(): Promise<Privy> {
  return (privyPromise ??= import("@privy-io/js-sdk-core").then(async ({ default: Privy, LocalStorage }) => {
    const client = new Privy({ appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "", storage: new LocalStorage() });
    await client.initialize();
    return client;
  }));
}

export async function sendEmailCode(email: string) {
  await (await privy()).auth.email.sendCode(email.trim());
}

// Google sign in: Privy sends the person to Google and Google sends them back to /app with a code and a state in the address.
export const googleSignInAvailable = emailSignInAvailable && process.env.NEXT_PUBLIC_GOOGLE_SIGNIN === "on";
const GOOGLE_NETWORK = "scrim-google-network";

export async function startGoogleSignIn(network: Network) {
  const client = await privy();
  const { url } = await client.auth.oauth.generateURL("google", `${window.location.origin}/app`);
  try { sessionStorage.setItem(GOOGLE_NETWORK, network); } catch { /* the current network is used instead */ }
  window.location.assign(url);
}

// The code and state Google handed back, taken off the address so a reload cannot reuse them.
export function takeGoogleReturn(): { code: string; state: string; network: Network | null } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("privy_oauth_code");
  const state = params.get("privy_oauth_state");
  if (!code || !state) return null;
  window.history.replaceState({}, "", window.location.pathname);
  let saved: string | null = null;
  try { saved = sessionStorage.getItem(GOOGLE_NETWORK); sessionStorage.removeItem(GOOGLE_NETWORK); } catch { /* none saved */ }
  return { code, state, network: saved === "mainnet" || saved === "testnet" ? saved : null };
}

export async function finishGoogleSignIn(code: string, state: string, network: Network) {
  const client = await privy();
  await client.auth.oauth.loginWithCode(code, state, "google");
  return openSession(client, network);
}

export async function signInWithEmail(email: string, code: string, network: Network): Promise<{ accountId: string; privateStatus: string }> {
  const client = await privy();
  await client.auth.email.loginWithCode(email.trim(), code.trim());
  return openSession(client, network);
}

async function openSession(client: Privy, network: Network): Promise<{ accountId: string; privateStatus: string }> {
  const accessToken = await client.getAccessToken();
  if (!accessToken) throw new Error("That didn't work. Try again.");
  const result = await api<{ accountId: string; privateStatus: string }>("/auth/email", { body: { accessToken, network } });
  try { localStorage.setItem(KEY, JSON.stringify({ accountId: result.accountId })); } catch { /* the sign in still worked */ }
  return result;
}

// Set while this browser is signed in with an email, so signing goes through Privy instead of a wallet app.
export function emailSession(): { accountId: string } | null {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as { accountId?: string }) : null;
    return parsed?.accountId ? { accountId: parsed.accountId } : null;
  } catch {
    return null;
  }
}

const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));

// The same shape a wallet app gives back, so every screen keeps working unchanged.
export async function signWithEmail(accountId: string, params: { message: string; recipient: string; nonce: Uint8Array }) {
  const client = await privy();
  const accessToken = await client.getAccessToken();
  if (!accessToken) throw new Error("Your email sign in ended. Sign in again.");
  const signed = await api<{ accountId: string; publicKey: string; signature: string }>("/email/sign", {
    body: { accessToken, message: params.message, recipient: params.recipient, nonce: base64(params.nonce) },
  });
  return { accountId: signed.accountId || accountId, publicKey: signed.publicKey, signature: signed.signature };
}

// Sends a plain payment from the email account's own balance. The answer has the shape a wallet app gives back.
export async function sendWithEmail(params: { receiverId: string; actions: unknown[] }): Promise<unknown> {
  const client = await privy();
  const accessToken = await client.getAccessToken();
  if (!accessToken) throw new Error("Your email sign in ended. Sign in again.");
  return api("/email/transaction", { body: { accessToken, receiverId: params.receiverId, actions: params.actions } });
}

export async function endEmailSession() {
  try { localStorage.removeItem(KEY); } catch { /* nothing stored */ }
  try { await (await privy()).auth.logout({}); } catch { /* already signed out */ }
}

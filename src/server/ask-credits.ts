// Paying for Ask. Every account gets one free question. After that, people pay with their own money,
// never the site owner's: they top up Ask credits with one USDC transfer to the site owner's account,
// from their private balance or straight from their wallet (their choice), and each question takes its price.
import type { Session } from "./auth";
import { catalog } from "./assets";
import { sql } from "./db";
import { badRequest, conflict, HttpError } from "./errors";
import { finalTransaction } from "./near-rpc";
import { cancelTransfer, createTransfer, getTransfer, type Transfer } from "./transfers";

// What one question costs, in US dollars; and where top-ups go (the site owner's NEAR account).
// A missing, zero or mistyped price falls back to 2 cents: a question is never free by accident.
const PRICE_MICROS = () => {
  const usd = Number(process.env.ASK_PRICE_USD ?? 0.02);
  return BigInt(Math.round((Number.isFinite(usd) && usd > 0 ? usd : 0.02) * 1e6));
};
const FEE_ACCOUNT = () => process.env.ASK_FEE_ACCOUNT?.trim() || null;
const TOP_UPS = [1, 5, 20]; // dollars; credits never expire

export type AskAccount = {
  freeLeft: number; creditUsd: number; priceUsd: number; questionsLeft: number; canTopUp: boolean;
  walletPay: { to: string; token: string } | null; // for a top-up straight from the wallet: who to pay, in which USDC contract
};

const usdcOnNear = async () => (await catalog()).find((a) => a.symbol === "USDC" && a.chain === "near") ?? null;

const usd = (micros: bigint) => Number(micros) / 1e6;

export async function askAccount(session: Session): Promise<AskAccount> {
  await creditFinishedTopUps(session);
  const [row] = await sql<{ free_used: boolean; balance_micros: string }[]>`SELECT free_used, balance_micros::text FROM ask_credits WHERE account_id = ${session.accountId}`;
  const balance = BigInt(row?.balance_micros ?? "0");
  const price = PRICE_MICROS();
  const freeLeft = row?.free_used ? 0 : 1;
  return {
    freeLeft, creditUsd: usd(balance), priceUsd: usd(price),
    questionsLeft: freeLeft + (price > 0n ? Number(balance / price) : 0),
    canTopUp: session.network === "mainnet" && FEE_ACCOUNT() !== null,
    walletPay: await walletPay(session),
  };
}

async function walletPay(session: Session): Promise<AskAccount["walletPay"]> {
  const to = FEE_ACCOUNT();
  if (session.network !== "mainnet" || !to) return null;
  const usdc = await usdcOnNear().catch(() => null);
  return usdc ? { to, token: usdc.assetId.replace(/^nep141:/, "") } : null;
}

// A top-up the person paid straight from their wallet: read the transaction from the chain, check it is
// theirs, succeeded, and sent USDC to the site owner, then credit it once.
export async function creditWalletTopUp(session: Session, txHash: string): Promise<AskAccount> {
  const pay = await walletPay(session);
  if (!pay) throw new HttpError(503, "not_enabled", "Buying Ask credits isn't switched on for this site yet.");
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(txHash)) throw badRequest("That transaction hash doesn't look right.");
  const tx = await finalTransaction("mainnet", txHash, session.accountId).catch(() => null);
  if (!tx) throw conflict("That payment isn't on the chain yet. Try again in a few seconds.");
  if (tx.transaction.signer_id !== session.accountId || tx.transaction.receiver_id !== pay.token || tx.status.SuccessValue === undefined) {
    throw badRequest("That transaction isn't a finished USDC payment from your wallet.");
  }
  let micros = 0n;
  for (const action of tx.transaction.actions as { FunctionCall?: { method_name: string; args: string } }[]) {
    if (action.FunctionCall?.method_name !== "ft_transfer") continue;
    try {
      const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as { receiver_id?: string; amount?: string };
      if (args.receiver_id === pay.to && /^\d+$/.test(args.amount ?? "")) micros += BigInt(args.amount!); // USDC has 6 decimals: units are micros
    } catch { /* not JSON: not a transfer to count */ }
  }
  if (micros < 1_000_000n) throw badRequest(`That transaction didn't send at least $1 of USDC to ${pay.to}.`);
  await sql.begin(async (q) => {
    const added = await q`INSERT INTO ask_wallet_topups (tx_hash, account_id, usd_micros) VALUES (${txHash}, ${session.accountId}, ${micros.toString()}::bigint)
      ON CONFLICT (tx_hash) DO NOTHING RETURNING tx_hash`;
    if (added.length !== 1) return; // already credited
    await q`INSERT INTO ask_credits (account_id, balance_micros) VALUES (${session.accountId}, ${micros.toString()}::bigint)
      ON CONFLICT (account_id) DO UPDATE SET balance_micros = ask_credits.balance_micros + ${micros.toString()}::bigint, updated_at = now()`;
  });
  return askAccount(session);
}

// Takes the free question, or one question's price from the credits, atomically. Returns how to give it back.
export async function chargeQuestion(session: Session): Promise<() => Promise<void>> {
  await creditFinishedTopUps(session);
  const free = await sql`INSERT INTO ask_credits (account_id, free_used) VALUES (${session.accountId}, true)
    ON CONFLICT (account_id) DO UPDATE SET free_used = true, updated_at = now() WHERE ask_credits.free_used = false RETURNING account_id`;
  if (free.length === 1) return async () => { await sql`UPDATE ask_credits SET free_used = false WHERE account_id = ${session.accountId}`; };
  const price = PRICE_MICROS().toString();
  const paid = await sql`UPDATE ask_credits SET balance_micros = balance_micros - ${price}::bigint, updated_at = now()
    WHERE account_id = ${session.accountId} AND balance_micros >= ${price}::bigint RETURNING account_id`;
  if (paid.length === 1) return async () => { await sql`UPDATE ask_credits SET balance_micros = balance_micros + ${price}::bigint WHERE account_id = ${session.accountId}`; };
  throw new HttpError(402, "credits_needed", session.network === "mainnet" ? "You've used your free question. Add Ask credits to keep asking." : "You've used your free question. Ask with credits on mainnet.");
}

// Starts a top-up: a private USDC transfer from the person's balance to the site owner. Their wallet signs it.
export async function startTopUp(session: Session, dollars: number): Promise<Transfer> {
  if (session.network !== "mainnet") throw badRequest("Ask credits are bought on mainnet, from your private balance.");
  const to = FEE_ACCOUNT();
  if (!to) throw new HttpError(503, "not_enabled", "Buying Ask credits isn't switched on for this site yet.");
  if (!TOP_UPS.includes(dollars)) throw badRequest(`Choose ${TOP_UPS.map((d) => `$${d}`).join(" or ")}.`);
  const usdc = await usdcOnNear();
  if (!usdc) throw new HttpError(503, "upstream", "USDC isn't available right now.");
  const [{ open }] = await sql<{ open: number }[]>`SELECT count(*)::int AS open FROM ask_topups WHERE account_id = ${session.accountId} AND credited_at IS NULL AND created_at > now() - interval '1 hour'`;
  if (open >= 3) throw badRequest("You have top-ups still on their way. Wait for them before adding more.");
  const transfer = await createTransfer(session, { kind: "send", fromAssetId: usdc.assetId, amount: String(dollars), recipient: to, note: "Ask credits" });
  // Nothing moves until the person signs; if the record can't be kept, the transfer is cancelled first.
  try {
    await sql`INSERT INTO ask_topups (transfer_id, account_id, usd_micros) VALUES (${transfer.id}, ${session.accountId}, ${dollars * 1_000_000})`;
  } catch (error) {
    await cancelTransfer(session, transfer.id).catch(() => null);
    throw error;
  }
  return transfer;
}

// Credits each top-up once its private transfer has been delivered. Safe to call repeatedly.
async function creditFinishedTopUps(session: Session) {
  // Any uncredited top-up whose transfer has arrived, however long it took; only a few in-flight ones
  // are re-checked with the payment network per visit.
  const pending = await sql<{ transfer_id: string; usd_micros: string; status: string }[]>`
    SELECT a.transfer_id, a.usd_micros::text, t.status FROM ask_topups a JOIN transfers t ON t.id = a.transfer_id
    WHERE a.account_id = ${session.accountId} AND a.credited_at IS NULL AND t.status NOT IN ('cancelled', 'expired', 'failed', 'refunded')
    ORDER BY a.created_at DESC LIMIT 5`;
  for (const t of pending) {
    const status = t.status === "success" ? "success" : (await getTransfer(session, t.transfer_id).catch(() => null))?.status;
    if (status !== "success") continue;
    await sql.begin(async (tx) => {
      const marked = await tx`UPDATE ask_topups SET credited_at = now() WHERE transfer_id = ${t.transfer_id} AND credited_at IS NULL RETURNING transfer_id`;
      if (marked.length !== 1) return;
      await tx`INSERT INTO ask_credits (account_id, balance_micros) VALUES (${session.accountId}, ${t.usd_micros}::bigint)
        ON CONFLICT (account_id) DO UPDATE SET balance_micros = ask_credits.balance_micros + ${t.usd_micros}::bigint, updated_at = now()`;
    });
  }
}

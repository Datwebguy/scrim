// Tools for an AI app connected to a person's own Scrim account (see connectors.ts).
// Reads (balance, activity, coins, prices, deposit address) and prepares swaps, sends and withdrawals.
// Nothing here can move money: a prepared payment is a request the person confirms on Scrim's own screen.
import { formatAmount } from "@/protocol/amount";
import type { Session } from "./auth";
import { catalog } from "./assets";
import { overview } from "./balances";
import { HttpError } from "./errors";
import { privateStatus, sharePrivateAccess } from "./private-access";
import { aiRequestForApp, createAiRequest, type AiRequestDetails, type AiRequestKind } from "./ai-requests";
import { config } from "./config";
import { sql } from "./db";
import { accountExists, publicHoldings } from "./holdings";
import { createPayLink, listPayLinks } from "./paylinks";
import { createTransfer, listTransfers, preview } from "./transfers";

// The NEAR wallet's coins, named the way Scrim's Send and Swap screens name them.
const NATIVE = "native:near";
const WNEAR = "nep141:wrap.near";
const walletId = (id: string) => (id === "near" ? NATIVE : `nep141:${id}`);
const intentsId = (id: string) => (id === NATIVE ? WNEAR : id);
function positive(amount: string) {
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) throw new HttpError(400, "invalid_request", "Enter an amount greater than zero, like \"5\" or \"0.5\".");
}

export const PERSONAL_INSTRUCTIONS =
  "This is the person's own Scrim account: private money on NEAR. Call get_account first. You can read the private balance and activity, find coins, price swaps and get a deposit address. To swap, send or withdraw, call prepare_swap, prepare_send or prepare_withdraw: each checks the price and files a request in Scrim, returning a request_id and an approval_url. Give the person the link; they review it in Scrim and confirm with their own wallet. Nothing moves until they do, and you can't confirm for them. Follow it with get_request. Never ask for a seed phrase or private key.";

const LOCKED =
  "The private balance is locked. Ask the person to open scrim.exchange/app and tap Unlock, then try again.";

export const PERSONAL_TOOLS = [
  {
    name: "get_account",
    title: "My Scrim account",
    description: "The person's NEAR account, network, and whether the private balance is unlocked. Call this first.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_balance",
    title: "Private balance",
    description: "What the person holds in their private balance: each coin, the chain it's on, the amount and its value in US dollars, plus the total.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_activity",
    title: "Recent activity",
    description: "The person's recent adds, sends, swaps and withdrawals in Scrim, newest first, with where each one stands.",
    inputSchema: { type: "object", properties: { limit: { type: "integer", description: "Optional. How many, 1 to 50 (default 20)." } }, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "find_coin",
    title: "Find a coin",
    description: "Searches the coins Scrim can hold and swap (from NEAR Intents) by symbol or chain, for example \"USDC\", \"PEPE\" or \"solana\". Returns each match's asset_id, which quote_swap needs.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "A symbol, name or chain." }, limit: { type: "integer", description: "Optional. 1 to 25 (default 10)." } },
      required: ["query"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "quote_swap",
    title: "Price a swap",
    description: "Prices a private swap inside the person's balance, without doing it: what they would pay, what they would get, the fee and the minimum received. Get both asset_ids from find_coin or get_balance first.",
    inputSchema: {
      type: "object",
      properties: {
        from_asset_id: { type: "string", description: "The coin to pay with." },
        to_asset_id: { type: "string", description: "The coin to get." },
        amount: { type: "string", description: "How much to pay, in whole coins, for example \"25\" or \"0.5\"." },
      },
      required: ["from_asset_id", "to_asset_id", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_request",
    title: "Check a prepared payment",
    description: "Where a swap, send or withdrawal prepared with a prepare_ tool stands: waiting_for_you (the person hasn't confirmed yet), in_progress, done, failed, declined or expired.",
    inputSchema: { type: "object", properties: { request_id: { type: "string", description: "The request_id a prepare_ tool returned." } }, required: ["request_id"], additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "get_deposit_address",
    title: "Address to add money",
    description: "A deposit address for adding money from another chain, for example USDC on Base or SOL on Solana. Anything sent there arrives in the person's private balance, or with into: \"wallet\" in their NEAR wallet. Get the asset_id (the coin on the chain it is sent from) from find_coin.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The coin and chain the money is sent from." },
        into: { type: "string", enum: ["private", "wallet"], description: "Optional. \"wallet\" lands it in the NEAR wallet, in public (a coin from another chain). Default: the private balance." },
      },
      required: ["asset_id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "prepare_swap",
    title: "Swap (needs approval)",
    description: "Prepares a swap, private inside the person's balance by default, or from their NEAR wallet with from_wallet. NEAR to wNEAR (or back) from the wallet is a wrap, one to one. Returns its price, a request_id and an approval_url. The person opens the link, checks it in Scrim and confirms with their wallet. Nothing moves until they do.",
    inputSchema: {
      type: "object",
      properties: {
        from_asset_id: { type: "string", description: "The coin to pay with, from get_balance." },
        to_asset_id: { type: "string", description: "The coin to get, from find_coin." },
        amount: { type: "string", description: "How much to pay, in whole coins." },
        from_wallet: { type: "boolean", description: "Optional. true pays from the NEAR wallet, in public (asset_ids from get_wallet). Default: the private balance." },
      },
      required: ["from_asset_id", "to_asset_id", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "prepare_send",
    title: "Send to a NEAR account (needs approval)",
    description: "Prepares a payment from the private balance (or the NEAR wallet, with from_wallet) to a NEAR account (like ada.near) and returns its price, a request_id and an approval_url. A .near name is paid privately. A 64 character NEAR address, which exchanges use, is paid out on the blockchain so it arrives there. For addresses on other chains, use prepare_withdraw. Nothing moves until the person confirms.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The coin to send, from get_balance." },
        amount: { type: "string", description: "How much they get, in whole coins." },
        to: { type: "string", description: "The NEAR account or 64 character NEAR address." },
        note: { type: "string", description: "Optional, up to 140 characters. Only the person sees it." },
        from_wallet: { type: "boolean", description: "Optional. true pays from the NEAR wallet, in public (asset_ids from get_wallet). Default: the private balance." },
      },
      required: ["asset_id", "amount", "to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "prepare_withdraw",
    title: "Withdraw to any address (needs approval)",
    description: "Prepares a payout from the private balance (or the NEAR wallet, with from_wallet) to an address on any chain (for example USDC to a Base address, or SOL to a Solana address) and returns its price, a request_id and an approval_url. The payout is public on that chain. Nothing moves until the person confirms.",
    inputSchema: {
      type: "object",
      properties: {
        from_asset_id: { type: "string", description: "The coin to pay with, from get_balance." },
        to_asset_id: { type: "string", description: "The coin and chain they receive, from find_coin." },
        amount: { type: "string", description: "How much they receive, in whole coins." },
        to_address: { type: "string", description: "The address on that chain." },
        from_wallet: { type: "boolean", description: "Optional. true pays from the NEAR wallet, in public (asset_ids from get_wallet). Default: the private balance." },
      },
      required: ["from_asset_id", "to_asset_id", "amount", "to_address"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "get_wallet",
    title: "NEAR wallet",
    description: "What the person's NEAR wallet holds. Unlike the private balance, the wallet is public on the blockchain. Its asset_ids are what the prepare_ tools take with from_wallet.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
  {
    name: "create_payment_link",
    title: "Get paid: make a payment link",
    description: "Makes a link that asks for a set amount. Whoever has it can pay from any chain; it lands in the person's private balance, or with receive: \"wallet\" (coins on NEAR only) in their NEAR wallet. Making a link moves no money.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The coin to be paid in, from find_coin, for example USDC on NEAR." },
        amount: { type: "string", description: "How much, in whole coins." },
        note: { type: "string", description: "Optional, up to 140 characters, shown to the payer." },
        receive: { type: "string", enum: ["private", "wallet"], description: "Optional. Where it lands. Default: private." },
        days: { type: "integer", enum: [1, 7, 30], description: "Optional. How long it stays open. Default 7." },
      },
      required: ["asset_id", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "list_payment_links",
    title: "My payment links",
    description: "The person's recent payment links and whether each is open, paid, closed or expired.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true },
  },
];

// A connected app keeps working after the person unlocks again in the browser.
async function ensureAccess(session: Session) {
  const access = await privateStatus(session);
  if (access.status === "active") return "active";
  if (access.status === "mainnet_only") return access.status;
  return sharePrivateAccess(session);
}

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

async function appName(clientId: string | undefined) {
  if (!clientId) return "Your AI app";
  const [row] = await sql<{ name: string }[]>`SELECT name FROM oauth_clients WHERE id = ${clientId}`;
  return row?.name ?? "Your AI app";
}

// Files the request in Scrim. The person reviews it there (a link, or the waiting list on Home) and confirms with their wallet.
async function fileRequest(session: Session & { clientId?: string }, kind: AiRequestKind, details: AiRequestDetails, price: { you_pay: string; they_get: string }) {
  const id = await createAiRequest(session, { clientId: session.clientId, name: await appName(session.clientId) }, kind, details);
  return { request_id: id, approval_url: `${config.siteUrl}/app/approve/${id}`, state: "waiting_for_you", next: NEEDS_YOU, ...price };
}

async function priced(session: Session, input: Parameters<typeof preview>[1]) {
  const p = await preview(session, input);
  const all = await catalog();
  const dec = (id: string) => all.find((a) => a.assetId === id)?.decimals;
  const fmt = (amount: string, d?: number) => (d === undefined ? amount : formatAmount(amount, d, 2));
  return {
    you_pay: `${fmt(p.youPay.amount, dec(p.youPay.assetId))} ${p.youPay.symbol} (${p.youPay.chainName})`,
    they_get: `${fmt(p.theyGet.amount, dec(p.theyGet.assetId))} ${p.theyGet.symbol} (${p.theyGet.chainName})`,
    fee_usd: Number(p.fee.usd.toFixed(2)),
    enough_balance: p.enoughBalance,
  };
}

const NEEDS_YOU = "Waiting for the person. They review it in Scrim (this link, or Home) and confirm with their wallet; the final price is set then. Check it with get_request; don't prepare it again.";

export async function callPersonalTool(session: Session & { clientId?: string }, name: string, args: Record<string, unknown>): Promise<unknown | undefined> {
  const text = (key: string) => String(args[key] ?? "").trim();
  switch (name) {
    case "get_deposit_address": {
      const intoWallet = args.into === "wallet";
      if (!intoWallet && (await ensureAccess(session)) !== "active") return { error: LOCKED };
      const t = await createTransfer(session, { kind: "add", fromAssetId: text("asset_id"), amount: "", privacy: intoWallet ? "public" : "private" });
      if (!t.deposit) return { error: "No deposit address for this coin right now. Try another chain." };
      return {
        send: `${t.fromAsset.symbol} on ${t.deposit.chainName}`,
        address: t.deposit.address,
        memo: t.deposit.memo ?? undefined,
        minimum: t.deposit.minimum ? `${formatAmount(t.deposit.minimum, t.fromAsset.decimals, 2)} ${t.fromAsset.symbol}` : undefined,
        valid_until: t.expiresAt,
        note: `Send only ${t.fromAsset.symbol} on ${t.deposit.chainName} to this address. It arrives in ${intoWallet ? `the NEAR wallet as ${t.toAsset.symbol}, in public` : "the private balance"}.`,
      };
    }
    case "prepare_swap": {
      const wallet = args.from_wallet === true;
      if (!wallet && (await ensureAccess(session)) !== "active") return { error: LOCKED };
      const from = text("from_asset_id"), to = text("to_asset_id"), amount = text("amount");
      // NEAR and wNEAR in the wallet: the wNEAR contract changes one for the other, one to one, with no swap.
      if (wallet && [from, to].sort().join() === [NATIVE, WNEAR].sort().join()) {
        positive(amount);
        const what = from === NATIVE ? `Wrap ${amount} NEAR to wNEAR in your wallet` : `Unwrap ${amount} wNEAR to NEAR in your wallet`;
        return await fileRequest(session, "swap", { mode: "swap", source: "wallet", from, to, amount, summary: what }, { you_pay: `${amount} ${from === NATIVE ? "NEAR" : "wNEAR"}`, they_get: `${amount} ${from === NATIVE ? "wNEAR" : "NEAR"}` });
      }
      const price = await priced(session, { kind: "swap", fromAssetId: intentsId(from), toAssetId: intentsId(to), amount, privacy: wallet ? "public" : "private" });
      return { ...await fileRequest(session, "swap", { mode: "swap", source: wallet ? "wallet" : "private", from, to, amount, summary: `Swap ${price.you_pay} for ${price.they_get}${wallet ? " from your wallet" : ""}` }, price), fee_usd: price.fee_usd, enough_balance: price.enough_balance };
    }
    case "prepare_send": {
      const wallet = args.from_wallet === true;
      if (!wallet && (await ensureAccess(session)) !== "active") return { error: LOCKED };
      const to = text("to").toLowerCase();
      const asset = text("asset_id");
      const amount = text("amount");
      if (wallet) {
        // From the wallet to a NEAR account is an ordinary transfer the wallet signs: no route, no fee from Scrim.
        positive(amount);
        if (to === session.accountId) return { error: "That's their own account." };
        if (!/^[0-9a-f]{64}$/.test(to) && !(await accountExists(session.network, to))) return { error: `${to} doesn't exist on NEAR. Check the address.` };
        const coin = (await publicHoldings(session.network, session.accountId)).find((h) => walletId(h.id) === asset);
        if (!coin) return { error: "The wallet doesn't hold that coin. Call get_wallet for what it holds." };
        const price = { you_pay: `${amount} ${coin.symbol} (NEAR)`, they_get: `${amount} ${coin.symbol} (NEAR)` };
        return { ...await fileRequest(session, "send", { mode: "person", source: "wallet", from: asset, amount, recipient: to, summary: `Send ${amount} ${coin.symbol} from your wallet to ${to}` }, price), public_on_chain: true };
      }
      // A 64 hex NEAR address (wallets, exchanges) is paid out on chain so it arrives; a .near name stays private.
      const onChain = /^[0-9a-f]{64}$/.test(to);
      const price = await priced(session, { kind: onChain ? "withdraw" : "send", fromAssetId: asset, toAssetId: asset, amount, recipient: to, note: text("note") || undefined, privacy: "private" });
      return { ...await fileRequest(session, "send", { mode: "person", from: asset, amount, recipient: to, note: text("note") || undefined, summary: `Send ${price.they_get} to ${to}` }, price), fee_usd: price.fee_usd, enough_balance: price.enough_balance, private: !onChain };
    }
    case "prepare_withdraw": {
      const wallet = args.from_wallet === true;
      if (!wallet && (await ensureAccess(session)) !== "active") return { error: LOCKED };
      const from = text("from_asset_id"), input = { toAssetId: text("to_asset_id"), amount: text("amount"), recipient: text("to_address") };
      const price = await priced(session, { kind: "withdraw", fromAssetId: intentsId(from), ...input, privacy: wallet ? "public" : "private" });
      return { ...await fileRequest(session, "withdraw", { mode: "address", source: wallet ? "wallet" : "private", from, to: input.toAssetId, amount: input.amount, recipient: input.recipient, summary: `Pay ${price.they_get} to ${input.recipient}${wallet ? " from your wallet" : ""}` }, price), fee_usd: price.fee_usd, enough_balance: price.enough_balance, public_on_chain: true };
    }
    case "get_wallet": {
      const holdings = await publicHoldings(session.network, session.accountId);
      return {
        account: session.accountId,
        note: "The NEAR wallet is public on the blockchain. Use these asset_ids with from_wallet: true.",
        holdings: holdings.filter((h) => BigInt(h.amount) > 0n || h.id === "near").map((h) => ({ symbol: h.symbol, amount: h.display, usd: h.usd === null ? null : Number(h.usd.toFixed(2)), asset_id: walletId(h.id) })),
      };
    }
    case "create_payment_link": {
      const link = await createPayLink(session, { assetId: text("asset_id"), amount: text("amount"), note: text("note") || undefined, days: Number(args.days ?? 7), receive: args.receive === "wallet" ? "wallet" : "private" });
      return { link: `${config.siteUrl}/pay/${link.code}`, amount: `${link.display} ${link.symbol} (${link.chainName})`, lands_in: link.receive === "wallet" ? "the NEAR wallet, in public" : "the private balance", expires_at: link.expiresAt, note: "Share this link with whoever pays. They can pay from any chain." };
    }
    case "list_payment_links": {
      const links = await listPayLinks(session);
      return { links: links.slice(0, 20).map((l) => ({ link: `${config.siteUrl}/pay/${l.code}`, amount: `${l.display} ${l.symbol}`, note: l.note || undefined, status: l.status, expires_at: l.expiresAt })) };
    }
    case "get_request":
      return await aiRequestForApp(session, text("request_id"));
    case "get_account": {
      const status = await ensureAccess(session);
      return {
        account: session.accountId,
        network: session.network,
        private_balance: status === "active" ? "unlocked" : status === "mainnet_only" ? "mainnet only" : "locked",
        note: status === "active" || status === "mainnet_only" ? undefined : LOCKED,
        app: "https://scrim.exchange/app",
      };
    }
    case "get_balance": {
      if ((await ensureAccess(session)) !== "active") return { error: LOCKED };
      const o = await overview(session);
      if (o.status !== "active") return { error: LOCKED };
      return {
        total_usd: Number(o.totalUsd.toFixed(2)),
        holdings: o.holdings.map((h) => ({ symbol: h.symbol, chain: h.chainName, amount: h.display, usd: h.usd === null ? null : Number(h.usd.toFixed(2)), asset_id: h.assetId })),
      };
    }
    case "get_activity": {
      const list = (await listTransfers(session)).slice(0, clamp(args.limit, 1, 50, 20));
      return {
        activity: list.map((t) => ({
          id: t.id, kind: t.kind, status: t.status, created: t.createdAt,
          paid: t.amountIn ? `${formatAmount(t.amountIn, t.fromAsset.decimals, 2)} ${t.fromAsset.symbol} (${t.fromAsset.chainName})` : null,
          got: t.amountOut ? `${formatAmount(t.amountOut, t.toAsset.decimals, 2)} ${t.toAsset.symbol} (${t.toAsset.chainName})` : null,
          to: t.recipient ?? null,
        })),
      };
    }
    case "find_coin": {
      const q = String(args.query ?? "").trim().toLowerCase();
      if (!q) return { error: "Say which coin to look for." };
      const all = await catalog();
      const score = (a: (typeof all)[number]) => (a.symbol.toLowerCase() === q ? 0 : a.symbol.toLowerCase().startsWith(q) ? 1 : 2);
      const hits = all
        .filter((a) => a.symbol.toLowerCase().includes(q) || a.chainName.toLowerCase().includes(q) || a.chain.toLowerCase() === q)
        .sort((a, b) => score(a) - score(b) || (b.priceUsd ?? 0) - (a.priceUsd ?? 0))
        .slice(0, clamp(args.limit, 1, 25, 10));
      return { coins: hits.map((a) => ({ symbol: a.symbol, chain: a.chainName, asset_id: a.assetId, price_usd: a.priceUsd })) };
    }
    case "quote_swap": {
      if ((await ensureAccess(session)) !== "active") return { error: LOCKED };
      const p = await preview(session, {
        kind: "swap", fromAssetId: String(args.from_asset_id ?? ""), toAssetId: String(args.to_asset_id ?? ""), amount: String(args.amount ?? ""), privacy: "private",
      });
      const [from, to] = await Promise.all([catalog().then((c) => c.find((a) => a.assetId === p.youPay.assetId)), catalog().then((c) => c.find((a) => a.assetId === p.theyGet.assetId))]);
      const fmt = (amount: string, decimals?: number) => (decimals === undefined ? amount : formatAmount(amount, decimals, 2));
      return {
        you_pay: `${fmt(p.youPay.amount, from?.decimals)} ${p.youPay.symbol} (${p.youPay.chainName})`,
        you_get: `${fmt(p.theyGet.amount, to?.decimals)} ${p.theyGet.symbol} (${p.theyGet.chainName})`,
        minimum_received: `${fmt(p.minimumReceived, to?.decimals)} ${p.theyGet.symbol}`,
        fee_usd: Number(p.fee.usd.toFixed(2)),
        enough_balance: p.enoughBalance,
        seconds: p.secondsEstimate,
        note: "Only a price. To swap, the person opens scrim.exchange/app/swap.",
      };
    }
    default:
      return undefined;
  }
}

export function personalError(error: unknown) {
  if (error instanceof HttpError) return error.status === 409 ? LOCKED : error.message;
  return null;
}

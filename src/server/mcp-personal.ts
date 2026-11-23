// Tools for an AI app connected to a person's own Scrim account (see connectors.ts).
// Reads (balance, activity, coins, prices, deposit address) and prepares swaps, sends and withdrawals.
// Nothing here can move money: a prepared payment is a link to Scrim's own screen, which the person confirms.
import { formatAmount } from "@/protocol/amount";
import type { Session } from "./auth";
import { catalog } from "./assets";
import { overview } from "./balances";
import { HttpError } from "./errors";
import { privateStatus, sharePrivateAccess } from "./private-access";
import { config } from "./config";
import { sql } from "./db";
import { createTransfer, listTransfers, preview } from "./transfers";

export const PERSONAL_INSTRUCTIONS =
  "This is the person's own Scrim account: private money on NEAR. Call get_account first. You can read the private balance and activity, find coins, price swaps and get a deposit address. To swap, send or withdraw, call prepare_swap, prepare_send or prepare_withdraw: each checks the price and returns an approval_url. Give the person that link: they check it in Scrim and confirm with their own wallet. Nothing moves until they do, and you can't confirm for them. Never ask for a seed phrase or private key.";

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
    name: "get_deposit_address",
    title: "Address to add money",
    description: "A deposit address for adding money to the private balance from another chain, for example USDC on Base or SOL on Solana. Anything sent there arrives in the person's private balance. Get the asset_id (the coin on the chain it is sent from) from find_coin.",
    inputSchema: { type: "object", properties: { asset_id: { type: "string", description: "The coin and chain the money is sent from." } }, required: ["asset_id"], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "prepare_swap",
    title: "Swap (needs approval)",
    description: "Prepares a private swap inside the person's balance and returns its price and an approval_url. The person opens the link, checks it in Scrim and confirms with their wallet. Nothing moves until they do.",
    inputSchema: {
      type: "object",
      properties: {
        from_asset_id: { type: "string", description: "The coin to pay with, from get_balance." },
        to_asset_id: { type: "string", description: "The coin to get, from find_coin." },
        amount: { type: "string", description: "How much to pay, in whole coins." },
      },
      required: ["from_asset_id", "to_asset_id", "amount"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "prepare_send",
    title: "Send to a NEAR account (needs approval)",
    description: "Prepares a payment from the private balance to a NEAR account (like ada.near) and returns its price and an approval_url. A .near name is paid privately. A 64 character NEAR address, which exchanges use, is paid out on the blockchain so it arrives there. For addresses on other chains, use prepare_withdraw. Nothing moves until the person confirms.",
    inputSchema: {
      type: "object",
      properties: {
        asset_id: { type: "string", description: "The coin to send, from get_balance." },
        amount: { type: "string", description: "How much they get, in whole coins." },
        to: { type: "string", description: "The NEAR account or 64 character NEAR address." },
        note: { type: "string", description: "Optional, up to 140 characters. Only the person sees it." },
      },
      required: ["asset_id", "amount", "to"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "prepare_withdraw",
    title: "Withdraw to any address (needs approval)",
    description: "Prepares a payout from the private balance to an address on any chain (for example USDC to a Base address, or SOL to a Solana address) and returns its price and an approval_url. The payout is public on that chain. Nothing moves until the person confirms.",
    inputSchema: {
      type: "object",
      properties: {
        from_asset_id: { type: "string", description: "The coin to pay with, from get_balance." },
        to_asset_id: { type: "string", description: "The coin and chain they receive, from find_coin." },
        amount: { type: "string", description: "How much they receive, in whole coins." },
        to_address: { type: "string", description: "The address on that chain." },
      },
      required: ["from_asset_id", "to_asset_id", "amount", "to_address"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
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

// The Send or Swap screen, filled in. The person checks it and confirms with their wallet there.
function approvalUrl(page: "send" | "swap", app: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams({ ai: app });
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return `${config.siteUrl}/app/${page}?${q}`;
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

const NEEDS_YOU = "Give the person this link. They check it in Scrim and confirm with their wallet. Nothing moves until they do. The final price is set when they confirm.";

export async function callPersonalTool(session: Session & { clientId?: string }, name: string, args: Record<string, unknown>): Promise<unknown | undefined> {
  const text = (key: string) => String(args[key] ?? "").trim();
  switch (name) {
    case "get_deposit_address": {
      if ((await ensureAccess(session)) !== "active") return { error: LOCKED };
      const t = await createTransfer(session, { kind: "add", fromAssetId: text("asset_id"), amount: "", privacy: "private" });
      if (!t.deposit) return { error: "No deposit address for this coin right now. Try another chain." };
      return {
        send: `${t.fromAsset.symbol} on ${t.deposit.chainName}`,
        address: t.deposit.address,
        memo: t.deposit.memo ?? undefined,
        minimum: t.deposit.minimum ? `${formatAmount(t.deposit.minimum, t.fromAsset.decimals, 2)} ${t.fromAsset.symbol}` : undefined,
        valid_until: t.expiresAt,
        note: `Send only ${t.fromAsset.symbol} on ${t.deposit.chainName} to this address. It arrives in the private balance.`,
      };
    }
    case "prepare_swap": {
      if ((await ensureAccess(session)) !== "active") return { error: LOCKED };
      const input = { fromAssetId: text("from_asset_id"), toAssetId: text("to_asset_id"), amount: text("amount") };
      const price = await priced(session, { kind: "swap", ...input, privacy: "private" });
      return { ...price, approval_url: approvalUrl("swap", await appName(session.clientId), { mode: "swap", from: input.fromAssetId, to: input.toAssetId, amount: input.amount }), next: NEEDS_YOU };
    }
    case "prepare_send": {
      if ((await ensureAccess(session)) !== "active") return { error: LOCKED };
      const to = text("to").toLowerCase();
      const asset = text("asset_id");
      // A 64 hex NEAR address (wallets, exchanges) is paid out on chain so it arrives; a .near name stays private.
      const onChain = /^[0-9a-f]{64}$/.test(to);
      const price = await priced(session, { kind: onChain ? "withdraw" : "send", fromAssetId: asset, toAssetId: asset, amount: text("amount"), recipient: to, note: text("note") || undefined, privacy: "private" });
      return { ...price, private: !onChain, approval_url: approvalUrl("send", await appName(session.clientId), { mode: "person", from: asset, amount: text("amount"), recipient: to, note: text("note") || undefined }), next: NEEDS_YOU };
    }
    case "prepare_withdraw": {
      if ((await ensureAccess(session)) !== "active") return { error: LOCKED };
      const input = { fromAssetId: text("from_asset_id"), toAssetId: text("to_asset_id"), amount: text("amount"), recipient: text("to_address") };
      const price = await priced(session, { kind: "withdraw", ...input, privacy: "private" });
      return { ...price, public_on_chain: true, approval_url: approvalUrl("send", await appName(session.clientId), { mode: "address", from: input.fromAssetId, to: input.toAssetId, amount: input.amount, recipient: input.recipient }), next: NEEDS_YOU };
    }
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

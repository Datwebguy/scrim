// Tools for an AI app connected to a person's own Scrim account (see connectors.ts).
// This first set only reads: balance, activity, coins and swap prices. Nothing here can move money.
import { formatAmount } from "@/protocol/amount";
import type { Session } from "./auth";
import { catalog } from "./assets";
import { overview } from "./balances";
import { HttpError } from "./errors";
import { privateStatus, sharePrivateAccess } from "./private-access";
import { listTransfers, preview } from "./transfers";

export const PERSONAL_INSTRUCTIONS =
  "This is the person's own Scrim account: private money on NEAR. Call get_account first. These tools read the private balance and activity, find coins and price swaps. They can't move money: to send, swap or withdraw, the person opens scrim.exchange. Never ask for a seed phrase or private key.";

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

export async function callPersonalTool(session: Session, name: string, args: Record<string, unknown>): Promise<unknown | undefined> {
  switch (name) {
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

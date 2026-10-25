// Selling with x402. A product is a payment link that can be paid any number of times: agents buy it
// over x402 (`/api/x402/pay/<code>`), people on its pay page, from any coin on any chain. Every sale
// lands in the seller's private balance, and the buyer gets what the product delivers once paid:
// a text or link, or the seller's own API, which Scrim calls only after the payment is confirmed.
import { formatAmount, parseAmount } from "@/protocol/amount";
import { PRIVATE_MONEY_MAINNET_ONLY } from "@/protocol/networks";
import { audit } from "./audit";
import { assetById } from "./assets";
import type { Session } from "./auth";
import { sql } from "./db";
import { badRequest, HttpError, notFound } from "./errors";
import { linkAad, newCode } from "./paylinks";
import { safePublicUrl, safeRequest } from "./safe-fetch";
import { open, seal } from "./secrets";

type Delivery = { kind: "text"; text: string } | { kind: "api"; url: string; header?: { name: string; value: string } };
type Sealed = { name: string; description: string; deliver: Delivery };
const aad = (code: string, account: string) => `product:${code}:${account}`;

export type Product = {
  code: string; name: string; description: string; assetId: string; symbol: string; chainName: string; amount: string; display: string;
  delivers: "text" | "api"; open: boolean; sales: number; earned: string; createdAt: Date;
};

type Row = { id: string; account_id: string; asset_id: string; amount: string; status: string; product_sealed: string; created_at: Date; sales: number; earned: string | null };

async function toProduct(row: Row): Promise<Product> {
  const asset = await assetById(row.asset_id);
  const p = open<Sealed>(row.product_sealed, aad(row.id, row.account_id));
  return {
    code: row.id, name: p.name, description: p.description, assetId: asset.assetId, symbol: asset.symbol, chainName: asset.chainName,
    amount: row.amount, display: formatAmount(BigInt(row.amount), asset.decimals, 2), delivers: p.deliver.kind, open: row.status === "open",
    sales: row.sales, earned: formatAmount(BigInt(row.earned ?? "0"), asset.decimals, 2), createdAt: row.created_at,
  };
}

function checkDelivery(input: unknown): Delivery {
  const d = (input ?? {}) as Record<string, unknown>;
  if (d.kind === "text") {
    const text = String(d.text ?? "").trim();
    if (!text || text.length > 4000) throw badRequest("Write what the buyer gets (up to 4,000 characters): a message, a code or a link.");
    return { kind: "text", text };
  }
  if (d.kind === "api") {
    const url = String(d.url ?? "").trim();
    if (!safePublicUrl(url)) throw badRequest("Use your API's full public https:// address.");
    const h = d.header as { name?: unknown; value?: unknown } | undefined;
    const name = String(h?.name ?? "").trim();
    const value = String(h?.value ?? "").trim();
    if (name && !/^[A-Za-z0-9-]{1,64}$/.test(name)) throw badRequest("The header name can use letters, numbers and dashes.");
    return { kind: "api", url, ...(name && value ? { header: { name, value: value.slice(0, 500) } } : {}) };
  }
  throw badRequest("Choose what the buyer gets: a text or link, or your API.");
}

const SELECT = (account: string, network: string) => sql<Row[]>`
  SELECT l.id, l.account_id, l.asset_id, l.amount, l.status, l.product_sealed, l.created_at,
    count(t.id) FILTER (WHERE t.status = 'success')::int AS sales,
    (count(t.id) FILTER (WHERE t.status = 'success') * l.amount::numeric)::text AS earned
  FROM pay_links l LEFT JOIN transfers t ON t.pay_link_id = l.id AND t.kind = 'link_payment'
  WHERE l.account_id = ${account} AND l.network = ${network} AND l.product_sealed IS NOT NULL
  GROUP BY l.id ORDER BY l.created_at DESC LIMIT 100`;

export async function createProduct(session: Session, input: { name?: unknown; description?: unknown; assetId?: unknown; amount?: unknown; deliver?: unknown }): Promise<Product> {
  if (session.network !== "mainnet") throw new HttpError(503, "mainnet_only", PRIVATE_MONEY_MAINNET_ONLY);
  const name = String(input.name ?? "").trim();
  if (!name || name.length > 80) throw badRequest("Name what you're selling (up to 80 characters).");
  const description = String(input.description ?? "").trim();
  if (description.length > 280) throw badRequest("Keep the description under 280 characters.");
  const asset = await assetById(String(input.assetId ?? ""));
  let amount: bigint;
  try {
    amount = parseAmount(String(input.amount ?? ""), asset.decimals);
  } catch (e) {
    throw badRequest((e as Error).message);
  }
  if (amount <= 0n) throw badRequest("Set a price greater than zero.");
  const deliver = checkDelivery(input.deliver);
  const code = newCode();
  await sql.begin(async (tx) => {
    await tx`INSERT INTO pay_links (id, account_id, network, asset_id, amount, details_sealed, product_sealed, expires_at)
      VALUES (${code}, ${session.accountId}, ${session.network}, ${asset.assetId}, ${amount.toString()}, ${seal({ note: name }, linkAad(code, session.accountId))},
        ${seal({ name, description, deliver } satisfies Sealed, aad(code, session.accountId))}, now() + interval '10 years')`;
    await audit(tx, null, { type: "human", id: session.accountId }, "product.created", code);
  });
  return (await listProducts(session)).find((p) => p.code === code)!;
}

export const listProducts = async (session: Session) => Promise.all((await SELECT(session.accountId, session.network)).map(toProduct));

export async function stopSelling(session: Session, code: string) {
  const rows = await sql`UPDATE pay_links SET status = 'closed' WHERE id = ${code} AND account_id = ${session.accountId} AND product_sealed IS NOT NULL AND status = 'open' RETURNING id`;
  if (rows.length === 0) throw notFound("Product not found, or it's already stopped.");
}

export type Sale = { at: Date; status: string; paidWith: string; received: string };

// The seller's record of each sale: when, how it was paid, what arrived. Buyers stay anonymous.
export async function listSales(session: Session, code: string): Promise<Sale[]> {
  const [link] = await sql<{ id: string }[]>`SELECT id FROM pay_links WHERE id = ${code} AND account_id = ${session.accountId} AND product_sealed IS NOT NULL`;
  if (!link) throw notFound("Product not found.");
  const { linkPayments } = await import("./transfers");
  return (await linkPayments(session, code))
    .filter((t) => t.status !== "cancelled" && t.status !== "expired")
    .map((t) => ({ at: t.createdAt, status: t.status, paidWith: `${t.fromAsset.symbol} on ${t.fromAsset.chainName}`, received: `${formatAmount(BigInt(t.amountOut), t.toAsset.decimals, 2)} ${t.toAsset.symbol}` }));
}

// Public: what a buyer is told before paying.
export async function productInfo(code: string): Promise<{ name: string; description: string } | null> {
  const [row] = await sql<{ id: string; account_id: string; product_sealed: string | null }[]>`SELECT id, account_id, product_sealed FROM pay_links WHERE id = ${code}`;
  if (!row?.product_sealed) return null;
  const p = open<Sealed>(row.product_sealed, aad(row.id, row.account_id));
  return { name: p.name, description: p.description };
}

export type Delivered = { status: number; contentType: string; body: string };

// What the buyer receives, once a payment is confirmed. Only called after settlement.
export async function deliver(code: string): Promise<Delivered | null> {
  const [row] = await sql<{ id: string; account_id: string; product_sealed: string | null }[]>`SELECT id, account_id, product_sealed FROM pay_links WHERE id = ${code}`;
  if (!row?.product_sealed) return null;
  const p = open<Sealed>(row.product_sealed, aad(row.id, row.account_id));
  if (p.deliver.kind === "text") return { status: 200, contentType: "application/json", body: JSON.stringify({ product: p.name, content: p.deliver.text }) };
  const res = await safeRequest(p.deliver.url, { timeoutMs: 20_000, maxBytes: 512 * 1024, headers: p.deliver.header ? { [p.deliver.header.name]: p.deliver.header.value } : {} });
  if (!res) return { status: 502, contentType: "application/json", body: JSON.stringify({ product: p.name, error: "The seller's service didn't answer. Your payment is recorded; ask the seller for help." }) };
  return { status: res.status >= 200 && res.status < 300 ? 200 : 502, contentType: res.headers["content-type"] ?? "application/octet-stream", body: res.body };
}

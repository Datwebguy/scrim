// x402 for payment links, against the real NEAR Intents service. No money moves: quotes are real,
// deposits are not made. The quote and deposit steps need the partner key and are skipped without it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/server/auth";
import { catalog } from "@/server/assets";
import { sql } from "@/server/db";
import { createPayLink } from "@/server/paylinks";
import { checkToken, decodeHeader, encodeHeader, handleX402, issueToken } from "@/server/x402";
import { chooseEntry, requestPurchase } from "@/server/x402-client";
import { createAgent, agentFromApiKey } from "@/server/agents";
import { createTreasury } from "@/server/treasuries";
import { safeRequest } from "@/server/safe-fetch";
import { mainnetImplicitWallet, resetDatabase, signInAs } from "./live";

const hasKey = Boolean(process.env.ONECLICK_API_KEY);
let session: Session;
const RES = (code: string) => `https://scrim.test/api/x402/pay/${code}`;
const REFUND_EVM = "0x2527D02599Ba641c19Fea793Cd0f9A6e8457c317";

beforeAll(async () => {
  await resetDatabase();
  session = (await signInAs(mainnetImplicitWallet())).session;
}, 60_000);
afterAll(() => sql.end());

describe("operation token", () => {
  const destination = { network: "near-intents:confidential", asset: "nep141:usdc", amount: "1000000", recipient: "scrim:abc" };
  const later = new Date(Date.now() + 600_000);

  it("verifies only for the exact instrument, resource and destination it was issued for", () => {
    const token = issueToken("eip155:8453", "0xabc", undefined, "https://x/r", destination, later);
    expect(token).toMatch(/^s1\.\d+\.[A-Za-z0-9_-]+$/);
    expect(checkToken(token, "eip155:8453", "0xabc", undefined, "https://x/r", destination)).toBe("ok");
    expect(checkToken(token, "eip155:8453", "0xdef", undefined, "https://x/r", destination)).toBe("invalid");
    expect(checkToken(token, "eip155:8453", "0xabc", undefined, "https://x/other", destination)).toBe("invalid");
    expect(checkToken(token, "eip155:8453", "0xabc", undefined, "https://x/r", { ...destination, amount: "1" })).toBe("invalid");
    expect(checkToken(token.slice(0, -2) + "zz", "eip155:8453", "0xabc", undefined, "https://x/r", destination)).toBe("invalid");
  });

  it("expires a day after the refund deadline", () => {
    const old = issueToken("eip155:8453", "0xabc", undefined, "https://x/r", destination, new Date(Date.now() - 25 * 3600_000));
    expect(checkToken(old, "eip155:8453", "0xabc", undefined, "https://x/r", destination)).toBe("expired");
  });

  it("round-trips the base64 header encoding", () => {
    expect(decodeHeader(encodeHeader({ a: 1 }))).toEqual({ a: 1 });
    expect(decodeHeader("not json")).toBeNull();
  });
});

describe.skipIf(!hasKey)("paying a link over x402 (needs the partner key)", () => {
  let code = "";

  it("answers a plain request with 402 and one unquoted entry per origin", async () => {
    const usdc = (await catalog()).find((a) => a.symbol === "USDC" && a.chain === "near")!;
    code = (await createPayLink(session, { assetId: usdc.assetId, amount: "5", note: "x402 test", days: 1 })).code;
    const result = await handleX402(code, RES(code), null);
    expect(result.kind).toBe("required");
    if (result.kind !== "required") return;
    const base = result.body.accepts.find((e) => e.network === "eip155:8453")!;
    expect(base).toMatchObject({ scheme: "exact", amount: "", payTo: "", extra: { assetTransferMethod: "near-intents", paymentFlow: "upfront" } });
    expect(base.asset.toLowerCase()).toBe("0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
    expect(base.extra.destination).toMatchObject({ network: "near-intents:confidential", amount: "5000000", recipient: `scrim:${code}` });
    expect(JSON.stringify(result.body)).not.toContain(session.accountId); // the owner stays private
  });

  it("mints a real quote for a quote payload, and settles nothing for a deposit that never happened", async () => {
    const first = await handleX402(code, RES(code), null);
    if (first.kind !== "required") throw new Error("expected 402");
    const accepted = first.body.accepts.find((e) => e.network === "eip155:8453")!;
    const quote = await handleX402(code, RES(code), encodeHeader({ x402Version: 2, resource: { url: RES(code) }, accepted, payload: { type: "quote", refundTo: REFUND_EVM } }));
    expect(quote.kind).toBe("required");
    if (quote.kind !== "required") return;
    const quoted = quote.body.accepts[0];
    expect(quoted.payTo).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(BigInt(quoted.amount)).toBeGreaterThan(4_900_000n);
    expect(quoted.extra.operationToken).toMatch(/^s1\./);
    expect(new Date(quoted.extra.refundDeadline!).getTime()).toBeGreaterThan(Date.now());

    const deposit = (operationToken: string) =>
      encodeHeader({ x402Version: 2, resource: { url: RES(code) }, accepted, payload: { type: "deposit", operationToken, depositAddress: quoted.payTo, txHash: `0x${"ab".repeat(32)}` } });
    const forged = await handleX402(code, RES(code), deposit(quoted.extra.operationToken!.replace(/.$/, "x")));
    expect(forged.kind === "failed" && forged.receipt?.errorReason).toBe("invalid_exact_near_intents_token_invalid");
    const pending = await handleX402(code, RES(code), deposit(quoted.extra.operationToken!));
    expect(pending.kind).toBe("failed");
    if (pending.kind === "failed") expect(pending.receipt?.errorReason).toBe("settlement_pending");
  }, 120_000);

  it("refuses a refund address that isn't valid on the chosen network", async () => {
    const first = await handleX402(code, RES(code), null);
    if (first.kind !== "required") throw new Error("expected 402");
    const accepted = first.body.accepts.find((e) => e.network === "eip155:8453")!;
    const bad = await handleX402(code, RES(code), encodeHeader({ x402Version: 2, resource: { url: RES(code) }, accepted, payload: { type: "quote", refundTo: "not-an-address" } }));
    expect(bad.kind === "failed" && "error" in bad.body && bad.body.error).toBe("invalid_exact_near_intents_refund_address");
  });
});

describe("agents buying over x402", () => {
  it("never reaches internal addresses or plain http", async () => {
    expect(await safeRequest("https://localhost/x")).toBeNull();
    expect(await safeRequest("https://127.0.0.1/x")).toBeNull();
    expect(await safeRequest("http://example.com/x")).toBeNull();
  });

  it("asks only for https seller addresses, and only on mainnet teams", async () => {
    const team = await createTreasury(session, { name: "Buyers", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Shopper", perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example API" }] });
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    expect(agent.policy.counterparties[0].address).toBe("https://api.example.com");
    await expect(requestPurchase(agent, "http://api.example.com/data", "buy-0001-plain")).rejects.toThrow(/https/);
    await expect(requestPurchase(agent, "https://api.example.com/data", "buy-0002-nopay")).rejects.toThrow(/didn't ask for payment|Couldn't reach/);
  }, 60_000);
});

describe.skipIf(!hasKey)("choosing how to pay a seller (needs the partner key)", () => {
  it("picks USDC on Base from a real 402 and can price it", async () => {
    const usdc = (await catalog()).find((a) => a.symbol === "USDC" && a.chain === "near")!;
    const code = (await createPayLink(session, { assetId: usdc.assetId, amount: "2", note: "buyer test", days: 1 })).code;
    const result = await handleX402(code, RES(code), null);
    if (result.kind !== "required") throw new Error("expected 402");
    const choice = await chooseEntry(result.body);
    expect(choice?.entry.network).toBe("eip155:8453");
    expect(choice?.asset.symbol).toBe("USDC");
    expect(await chooseEntry({ accepts: [{ ...result.body.accepts[0], extra: { ...result.body.accepts[0].extra, assetTransferMethod: "eip3009" } }] })).toBeNull();
  }, 60_000);
});

describe("standard x402 sellers", () => {
  it("knows which standard routes an agent wallet can sign", async () => {
    const { payableByWallet } = await import("@/server/x402-wallet");
    const base = { scheme: "exact", network: "eip155:8453", amount: "1000", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: "0x0000000000000000000000000000000000000001", maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } };
    expect(payableByWallet(base)).toBe(true);
    expect(payableByWallet({ ...base, network: "eip155:42161" })).toBe(true);
    expect(payableByWallet({ ...base, scheme: "upto", extra: { ...base.extra, facilitatorAddress: "0x0000000000000000000000000000000000000002" } })).toBe(true);
    expect(payableByWallet({ ...base, network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" })).toBe(true);
    expect(payableByWallet({ ...base, scheme: "batch-settlement" })).toBe(false);
    expect(payableByWallet({ ...base, network: "stellar:pubnet" })).toBe(false);
    expect(payableByWallet({ ...base, amount: "" })).toBe(false);
  });

  it("finds real paid APIs in the public catalog, priced in dollars, with what this agent can pay", async () => {
    const { findPaidApis } = await import("@/server/x402-client");
    const results = await findPaidApis("weather", 10);
    expect(results.length).toBeGreaterThan(0);
    const payable = results.filter((r) => r.payable === "wallet");
    expect(payable.length).toBeGreaterThan(0);
    expect(payable.every((r) => r.url.startsWith("https://") && r.method === "GET" && r.priceUsd !== null && r.priceUsd > 0)).toBe(true);
  }, 60_000);

  it("asks a request-only agent to get its own wallet before buying from a standard seller", async () => {
    const { findPaidApis } = await import("@/server/x402-client");
    const seller = (await findPaidApis("weather", 10)).find((r) => r.payable === "wallet")!;
    const origin = new URL(seller.url).origin;
    const team = await createTreasury(session, { name: "Standard buyers", kind: "individual", signers: [], threshold: 1 });
    const { apiKey } = await createAgent(session, team.id, { name: "Weather bot", perActionCap: "1", rollingCap: "2", windowHours: 24, counterparties: [{ address: origin, label: "Weather" }] });
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    await expect(requestPurchase(agent, seller.url, "std-0001-nowallet")).rejects.toThrow(/own wallet/);
  }, 60_000);
});

describe("selling with x402", () => {
  it("sells something any number of times, keeps it out of one-off links, and delivers only what was set", async () => {
    const { createProduct, listProducts, productInfo, deliver, stopSelling } = await import("@/server/products");
    const { listPayLinks } = await import("@/server/paylinks");
    const usdc = (await catalog()).find((a) => a.symbol === "USDC" && a.chain === "near")!;
    await expect(createProduct(session, { name: "", assetId: usdc.assetId, amount: "1", deliver: { kind: "text", text: "x" } })).rejects.toThrow(/Name what/);
    await expect(createProduct(session, { name: "Report", assetId: usdc.assetId, amount: "1", deliver: { kind: "api", url: "http://localhost/x" } })).rejects.toThrow(/https/);
    const product = await createProduct(session, { name: "Weekly report", description: "PDF link", assetId: usdc.assetId, amount: "2.5", deliver: { kind: "text", text: "https://files.example.com/report.pdf" } });
    expect(product).toMatchObject({ name: "Weekly report", display: "2.50", delivers: "text", open: true, sales: 0 });
    expect((await listProducts(session)).map((p) => p.code)).toContain(product.code);
    expect((await listPayLinks(session)).map((l) => l.code)).not.toContain(product.code);
    expect(await productInfo(product.code)).toEqual({ name: "Weekly report", description: "PDF link" });
    expect(JSON.parse((await deliver(product.code, "test-purchase"))!.body)).toEqual({ product: "Weekly report", content: "https://files.example.com/report.pdf" });
    await stopSelling(session, product.code);
    expect((await listProducts(session)).find((p) => p.code === product.code)?.open).toBe(false);
  });
});

describe.skipIf(!hasKey)("selling with x402 (needs the partner key)", () => {
  it("describes the product in its 402 answer", async () => {
    const { createProduct } = await import("@/server/products");
    const usdc = (await catalog()).find((a) => a.symbol === "USDC" && a.chain === "near")!;
    const p = await createProduct(session, { name: "Price feed", description: "Latest prices", assetId: usdc.assetId, amount: "1", deliver: { kind: "text", text: "ok" } });
    const r = await handleX402(p.code, RES(p.code), null);
    expect(r.kind === "required" && r.body.resource.description).toMatch(/^Price feed: Latest prices/);
  }, 60_000);
});

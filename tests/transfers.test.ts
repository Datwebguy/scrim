import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createSignInChallenge, sessionFromToken, signIn, type Session } from "@/server/auth";
import { setCatalogForTests, type Asset } from "@/server/assets";
import { overview } from "@/server/balances";
import { sql } from "@/server/db";
import { setIntentsChainForTests, setKeyVerifierForTests } from "@/server/near-rpc";
import { setOneClickTransportForTests } from "@/server/oneclick";
import { approvePayment, createApprovalChallenge, createHumanPayment } from "@/server/payments";
import { createTreasury } from "@/server/treasuries";
import { cancelTransfer, createTransfer, getTransfer, listTransfers, payTeamRequest, preview, submitSigned } from "@/server/transfers";
import { resetDatabase, wallet, type Wallet } from "./helpers";

const USDC_NEAR = "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1";
const USDC_BASE = "nep141:base-0x833589fcd6edb6e08f4c7c32d4f71b54bda02913.omft.near";
const BTC = "nep141:btc.omft.near";
const RECIPIENT = "0x2a9b8e3a4c5f0e1d7b6a8c9d0e1f2a3b4c5d6e7f";

const asset = (assetId: string, symbol: string, network: string, networkName: string, decimals: number, priceUsd: number, depositChain: string | null): Asset =>
  ({ assetId, symbol, network, networkName, decimals, priceUsd, depositChain, minDeposit: "1000000" });

const keys = new Map<string, string>();
const calls: { path: string; headers: Record<string, string>; body: any }[] = [];
let statusFor = "PROCESSING";
let signerOverride: string | null = null;

function fakeNetwork(): typeof fetch {
  return (async (input: URL | string | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = Object.fromEntries(Object.entries((init?.headers ?? {}) as Record<string, string>));
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path: url.pathname, headers, body });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
    if (url.pathname === "/rpc") return json({ result: { address: "0xBridgeDepositAddress", chain: body.params[0].chain } });
    switch (url.pathname) {
      case "/v0/auth/authenticate": return json({ accessToken: "user-access", refreshToken: "user-refresh", expiresIn: 900, refreshExpiresIn: 604800 }, 201);
      case "/v0/account/balances": return json({ balances: [{ tokenId: USDC_NEAR, available: "100000000", source: "private" }, { tokenId: "nep141:unknown.token", available: "5", source: "private" }] });
      case "/v0/quote": {
        if (!headers["x-api-key"]) return json({ message: "Unauthorized" }, 401);
        const amount = BigInt(body.amount);
        const exactOut = body.swapType === "EXACT_OUTPUT";
        return json({
          quote: { depositAddress: `quote-${calls.length}`, amountIn: (exactOut ? amount + 120000n : amount).toString(), amountOut: (exactOut ? amount : amount - 120000n).toString(), minAmountOut: (amount - 500000n).toString(), timeEstimate: 12 },
          quoteRequest: body, signature: "ed25519:quote-signature", timestamp: new Date().toISOString(),
        }, 201);
      }
      case "/v0/generate-intent":
        return json({ intent: { standard: "nep413", payload: { recipient: "intents.near", nonce: Buffer.alloc(32, 9).toString("base64"), message: JSON.stringify({ deadline: new Date(Date.now() + 600000).toISOString(), intents: [{ intent: "token_diff" }], signer_id: signerOverride ?? body.signerId }) } } });
      case "/v0/submit-intent": return json({ intentHash: "intent-hash-1" });
      case "/v0/status": return json({ status: statusFor, updatedAt: new Date().toISOString(), swapDetails: { destinationChainTxHashes: [{ hash: "0xsettled" }] } });
    }
    return json({ message: "not found" }, 404);
  }) as typeof fetch;
}

beforeAll(async () => {
  process.env.ONECLICK_API_KEY = "test-partner-key";
  await resetDatabase();
  setKeyVerifierForTests(async (accountId, publicKey) => keys.get(accountId) === publicKey);
  setIntentsChainForTests({ currentSalt: async () => "252812b3", hasPublicKey: async () => true });
  setOneClickTransportForTests(fakeNetwork());
  setCatalogForTests([
    asset(USDC_NEAR, "USDC", "near", "NEAR", 6, 1, "near:mainnet"),
    asset(USDC_BASE, "USDC", "base", "Base", 6, 1, "eth:8453"),
    asset(BTC, "BTC", "btc", "Bitcoin", 8, 80000, "btc:mainnet"),
  ]);
});
afterAll(async () => {
  delete process.env.ONECLICK_API_KEY;
  setKeyVerifierForTests(null);
  setIntentsChainForTests(null);
  setOneClickTransportForTests(null);
  setCatalogForTests(null);
  await sql.end();
});

async function login(id: string): Promise<{ w: Wallet; session: Session; status: string }> {
  const w = wallet(id);
  keys.set(id, w.publicKey);
  const { token, privateStatus } = await signIn(w.sign(await createSignInChallenge(id)));
  return { w, session: (await sessionFromToken(token))!, status: privateStatus };
}

describe("private balance", () => {
  it("unlocks with the sign-in signature and lists holdings with USD value", async () => {
    const { session, status } = await login("alice.near");
    expect(status).toBe("active");
    const o = await overview(session);
    expect(o.status).toBe("active");
    expect(o.holdings).toHaveLength(1); // unknown tokens are not shown
    expect(o.holdings[0]).toMatchObject({ symbol: "USDC", networkName: "NEAR", display: "100.00" });
    expect(o.totalUsd).toBe(100);
  });

  it("never exposes the user session token and seals it at rest", async () => {
    const { session } = await login("bob.near");
    const [row] = await sql<{ tokens_sealed: string }[]>`SELECT tokens_sealed FROM private_access WHERE session_id = ${session.id}`;
    expect(row.tokens_sealed.startsWith("v1.")).toBe(true);
    expect(row.tokens_sealed).not.toContain("user-access");
    expect(JSON.stringify(await overview(session))).not.toContain("user-access");
  });

  it("asks the person to finish setup when their key is not registered with NEAR Intents", async () => {
    setIntentsChainForTests({ currentSalt: async () => "252812b3", hasPublicKey: async () => false });
    const { session, status } = await login("carol.near");
    setIntentsChainForTests({ currentSalt: async () => "252812b3", hasPublicKey: async () => true });
    expect(status).toBe("needs_setup");
    expect((await overview(session)).status).toBe("needs_setup");
  });
});

describe("private transfers", () => {
  it("previews a withdrawal with the fee and a balance check", async () => {
    const { session } = await login("dave.near");
    const p = await preview(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "25", recipient: RECIPIENT });
    expect(p.theyGet).toMatchObject({ symbol: "USDC", networkName: "Base", amount: "25000000" });
    expect(p.youPay.amount).toBe("25120000");
    expect(p.fee.usd).toBeCloseTo(0.12, 2);
    expect(p.enoughBalance).toBe(true);
    const big = await preview(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "500", recipient: RECIPIENT });
    expect(big.enoughBalance).toBe(false);
  });

  it("sends the partner key and the user's session on private quotes", async () => {
    const { session } = await login("erin.near");
    calls.length = 0;
    await preview(session, { kind: "swap", fromAssetId: USDC_NEAR, toAssetId: BTC, amount: "10" });
    const quote = calls.find((c) => c.path === "/v0/quote")!;
    expect(quote.headers["x-api-key"]).toBe("test-partner-key");
    expect(quote.headers.authorization).toBe("Bearer user-access");
    expect(quote.body).toMatchObject({ depositType: "CONFIDENTIAL_INTENTS", recipientType: "CONFIDENTIAL_INTENTS", refundType: "CONFIDENTIAL_INTENTS", swapType: "EXACT_INPUT", dry: true });
  });

  it("withdraws: quote, wallet signature, submit, settle", async () => {
    const { w, session } = await login("frank.near");
    statusFor = "PROCESSING";
    const t = await createTransfer(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "25", recipient: RECIPIENT, note: "Invoice 1048" });
    expect(t.status).toBe("awaiting_signature");
    expect(t.intentToSign?.recipient).toBe("intents.near");
    expect(t.recipient).toBe(RECIPIENT);

    const sent = await submitSigned(session, t.id, w.signPayload(t.intentToSign!));
    expect(sent.status).toBe("processing");
    expect(sent.intentToSign).toBeNull();
    expect(calls.filter((c) => c.path === "/v0/submit-intent").at(-1)!.body.signedData.signature).toMatch(/^ed25519:/);

    statusFor = "SUCCESS";
    const done = await getTransfer(session, t.id);
    expect(done.status).toBe("success");
    expect(done.resultHashes).toEqual(["0xsettled"]);
  });

  it("stores amounts and recipients sealed, never in plain columns", async () => {
    const { session } = await login("gina.near");
    const t = await createTransfer(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "7.77", recipient: RECIPIENT });
    const [row] = await sql<Record<string, unknown>[]>`SELECT * FROM transfers WHERE id = ${t.id}`;
    const dump = JSON.stringify(row);
    expect(dump).not.toContain(RECIPIENT);
    expect(dump).not.toContain("7770000");
  });

  it("rejects a signature that does not match, a different wallet, and a second submit", async () => {
    const { w, session } = await login("hank.near");
    const t = await createTransfer(session, { kind: "send", fromAssetId: USDC_NEAR, amount: "5", recipient: "ivy.near" });
    const other = wallet("mallory.near");
    await expect(submitSigned(session, t.id, other.signPayload(t.intentToSign!))).rejects.toThrow(/signed in with/);
    const bad = w.signPayload({ ...t.intentToSign!, message: t.intentToSign!.message + " " });
    await expect(submitSigned(session, t.id, bad)).rejects.toThrow(/doesn't match/);
    await submitSigned(session, t.id, w.signPayload(t.intentToSign!));
    await expect(submitSigned(session, t.id, w.signPayload(t.intentToSign!))).rejects.toThrow(/already sent|no longer open/);
  });

  it("refuses an intent that names a different signer", async () => {
    const { session } = await login("jade.near");
    signerOverride = "someone-else.near";
    await expect(createTransfer(session, { kind: "send", fromAssetId: USDC_NEAR, amount: "1", recipient: "kim.near" })).rejects.toThrow(/unexpected transfer/);
    signerOverride = null;
  });

  it("validates recipients, addresses and amounts before asking the network", async () => {
    const { session } = await login("leo.near");
    await expect(preview(session, { kind: "send", fromAssetId: USDC_NEAR, amount: "1", recipient: "Not A Name!" })).rejects.toThrow(/NEAR account/);
    await expect(preview(session, { kind: "send", fromAssetId: USDC_NEAR, amount: "1", recipient: "leo.near" })).rejects.toThrow(/your own account/);
    await expect(preview(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "1", recipient: "0x123" })).rejects.toThrow(/Base address/);
    await expect(preview(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "0", recipient: RECIPIENT })).rejects.toThrow(/greater than zero/);
    await expect(preview(session, { kind: "swap", fromAssetId: USDC_NEAR, toAssetId: USDC_NEAR, amount: "1" })).rejects.toThrow(/two different/);
    await expect(preview(session, { kind: "send", fromAssetId: "nep141:nope", amount: "1", recipient: "mo.near" })).rejects.toThrow(/not supported/);
  });

  it("adds money: gives a one-time deposit address on the chosen network", async () => {
    const { session } = await login("nina.near");
    calls.length = 0;
    const t = await createTransfer(session, { kind: "add", fromAssetId: BTC, amount: "0.001" });
    expect(t.status).toBe("awaiting_deposit");
    expect(t.deposit).toMatchObject({ address: "0xBridgeDepositAddress", network: "Bitcoin" });
    const quote = calls.find((c) => c.path === "/v0/quote")!;
    expect(quote.headers.authorization).toBeUndefined(); // adding money needs no private session
    expect(quote.body).toMatchObject({ depositType: "INTENTS", recipientType: "CONFIDENTIAL_INTENTS" });
    expect(calls.find((c) => c.path === "/rpc")!.body.params[0].chain).toBe("btc:mainnet");
  });

  it("keeps transfers private to their owner and lets open ones be cancelled once", async () => {
    const { session } = await login("omar.near");
    const { session: other } = await login("pia.near");
    const t = await createTransfer(session, { kind: "send", fromAssetId: USDC_NEAR, amount: "2", recipient: "pia.near" });
    await expect(getTransfer(other, t.id)).rejects.toThrow(/not found/);
    expect(await listTransfers(other)).toHaveLength(0);
    expect((await cancelTransfer(session, t.id)).status).toBe("cancelled");
    await expect(cancelTransfer(session, t.id)).rejects.toThrow(/no longer be cancelled/);
  });

  it("explains clearly when private transfers are not switched on", async () => {
    const { session } = await login("quinn.near");
    delete process.env.ONECLICK_API_KEY;
    await expect(preview(session, { kind: "swap", fromAssetId: USDC_NEAR, toAssetId: BTC, amount: "1" })).rejects.toThrow(/aren't switched on/);
    process.env.ONECLICK_API_KEY = "test-partner-key";
  });
});

describe("paying an approved team request", () => {
  it("pays from the owner's private balance and settles the request", async () => {
    const { w, session } = await login("ruth.near");
    const treasury = await createTreasury(session, { name: "Solo", kind: "individual", signers: [] });
    const request = await createHumanPayment(session, treasury.id, { recipient: RECIPIENT, amount: "40", memo: "Design work", idempotencyKey: "pay-team-0001" });
    await expect(payTeamRequest(session, request.id)).rejects.toThrow(/not approved yet/);
    const approved = await approvePayment(session, request.id, w.sign(await createApprovalChallenge(session, request.id)));
    expect(approved.status).toBe("approved");

    statusFor = "PROCESSING";
    const transfer = await payTeamRequest(session, request.id);
    expect(transfer.teamRequestId).toBe(request.id);
    expect(transfer.amountOut).toBe("40000000");
    await submitSigned(session, transfer.id, w.signPayload(transfer.intentToSign!));
    const [{ status: during }] = await sql<{ status: string }[]>`SELECT status FROM payment_requests WHERE id = ${request.id}`;
    expect(during).toBe("submitting");

    statusFor = "SUCCESS";
    await getTransfer(session, transfer.id);
    const [{ status: after }] = await sql<{ status: string }[]>`SELECT status FROM payment_requests WHERE id = ${request.id}`;
    expect(after).toBe("settled");
  });
});

import { checkProof, describeClaim } from "@/protocol/proof";
import { proofSigningKey } from "@/server/secrets";
import { createProof, listProofs, proofState, revokeProof } from "@/server/proofs";
import { closePayLink, createPayLink, linkRow, listPayLinks, publicLink } from "@/server/paylinks";
import { createLinkPayment, linkPaymentStatus } from "@/server/transfers";

describe("proofs", () => {
  const key = () => proofSigningKey().publicKey;

  it("proves a balance threshold for one named reader, without showing the real balance", async () => {
    const { session } = await login("sam.near");
    const proof = await createProof(session, { kind: "balance_at_least", unit: "usd", amount: "50", reader: "Northwind Bank", days: 7 });
    const check = checkProof(proof.token, key(), { viewer: "northwind bank" });
    expect(check.ok && check.readerMatches).toBe(true);
    expect(check.ok && describeClaim(check.payload.claim)).toBe("holds at least $50 in private funds");
    expect(proof.token).not.toContain("100"); // the real balance (100) is not in the statement
    expect(JSON.stringify(check)).not.toContain("sam.near");
  });

  it("refuses to prove more than is held", async () => {
    const { session } = await login("tess.near");
    await expect(createProof(session, { kind: "balance_at_least", unit: "usd", amount: "5000", reader: "Landlord", days: 1 })).rejects.toThrow(/below that amount/);
    await expect(createProof(session, { kind: "balance_at_least", unit: "asset", assetId: BTC, amount: "0.5", reader: "Landlord", days: 1 })).rejects.toThrow(/less than that in BTC/);
  });

  it("detects tampering, a wrong key, an expired proof, and a different reader", async () => {
    const { session } = await login("uma.near");
    const proof = await createProof(session, { kind: "balance_at_least", unit: "asset", assetId: USDC_NEAR, amount: "20", reader: "Auditor", days: 1 });
    const [prefix, body, sig] = proof.token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), reader: "Someone else" })).toString("base64url");
    expect(checkProof(`${prefix}.${forged}.${sig}`, key())).toEqual({ ok: false, reason: "signature" });
    expect(checkProof(proof.token, new Uint8Array(32).fill(1)).ok).toBe(false);
    expect(checkProof("not a proof", key())).toEqual({ ok: false, reason: "format" });
    expect(checkProof(proof.token.replace("scrimproof1", "scrimproof9"), key())).toEqual({ ok: false, reason: "version" });
    const later = checkProof(proof.token, key(), { now: new Date(Date.now() + 2 * 86_400_000) });
    expect(later.ok && later.expired).toBe(true);
    const wrongReader = checkProof(proof.token, key(), { viewer: "Landlord" });
    expect(wrongReader.ok && wrongReader.readerMatches).toBe(false);
  });

  it("proves a completed payment and lets the owner revoke a proof", async () => {
    const { w, session } = await login("vic.near");
    statusFor = "PROCESSING";
    const t = await createTransfer(session, { kind: "withdraw", fromAssetId: USDC_NEAR, toAssetId: USDC_BASE, amount: "12", recipient: RECIPIENT });
    await expect(createProof(session, { kind: "payment", transferId: t.id, reader: "Vendor", days: 7 })).rejects.toThrow(/hasn't completed/);
    await submitSigned(session, t.id, w.signPayload(t.intentToSign!));
    statusFor = "SUCCESS";
    await getTransfer(session, t.id);
    const proof = await createProof(session, { kind: "payment", transferId: t.id, reader: "Vendor", days: 30, revealExact: false });
    const check = checkProof(proof.token, key());
    expect(check.ok && describeClaim(check.payload.claim)).toBe("sent at least 12.00 USDC to Base");
    expect(check.ok && JSON.stringify(check.payload)).not.toContain(RECIPIENT);

    expect(await proofState(proof.id)).toEqual({ revoked: false });
    await revokeProof(session, proof.id);
    expect(await proofState(proof.id)).toEqual({ revoked: true });
    expect((await listProofs(session))[0].revoked).toBe(true);
    const { session: other } = await login("wes.near");
    await expect(revokeProof(other, proof.id)).rejects.toThrow(/not found/);
    expect(await listProofs(other)).toHaveLength(0);
  });
});

describe("payment links", () => {
  it("lets anyone pay from any chain into the requester's private balance, with no account", async () => {
    const { session } = await login("xena.near");
    const link = await createPayLink(session, { assetId: USDC_NEAR, amount: "75", note: "Logo design", days: 7 });
    expect(link.code).toMatch(/^[a-z2-9]{10}$/);

    const view = await publicLink(link.code);
    expect(view).toMatchObject({ display: "75.00", symbol: "USDC", note: "Logo design", status: "open", to: "xena.near" });

    calls.length = 0;
    statusFor = "PROCESSING";
    const payment = await createLinkPayment(await linkRow(link.code), { fromAssetId: BTC, refundAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" });
    expect(payment.deposit?.network).toBe("Bitcoin");
    const q = calls.find((c) => c.path === "/v0/quote")!;
    expect(q.headers.authorization).toBeUndefined();
    expect(q.body).toMatchObject({ depositType: "ORIGIN_CHAIN", recipient: "xena.near", recipientType: "CONFIDENTIAL_INTENTS", swapType: "EXACT_OUTPUT", amount: "75000000" });

    statusFor = "PENDING_DEPOSIT";
    expect((await linkPaymentStatus(link.code, payment.id)).status).toBe("awaiting_deposit");
    statusFor = "PROCESSING";
    expect((await linkPaymentStatus(link.code, payment.id)).status).toBe("processing");
    statusFor = "SUCCESS";
    expect((await linkPaymentStatus(link.code, payment.id)).status).toBe("success");
    expect((await publicLink(link.code)).status).toBe("paid");
    await expect(linkRow(link.code)).rejects.toThrow(/already paid/);
    expect((await listTransfers(session)).some((t) => t.kind === "link_payment" && t.status === "success")).toBe(true);
  });

  it("checks the refund address and keeps payments tied to their own link", async () => {
    const { session } = await login("yuri.near");
    const a = await createPayLink(session, { assetId: USDC_NEAR, amount: "5" });
    const b = await createPayLink(session, { assetId: USDC_NEAR, amount: "6" });
    await expect(createLinkPayment(await linkRow(a.code), { fromAssetId: BTC, refundAddress: "not-a-bitcoin-address" })).rejects.toThrow(/Bitcoin address/);
    statusFor = "PROCESSING";
    const pay = await createLinkPayment(await linkRow(a.code), { fromAssetId: BTC, refundAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" });
    await expect(linkPaymentStatus(b.code, pay.id)).rejects.toThrow(/not found/);
    await expect(publicLink("nope")).rejects.toThrow(/doesn't exist/);
  });

  it("can be closed by its owner only", async () => {
    const { session } = await login("zed.near");
    const { session: other } = await login("amy.near");
    const link = await createPayLink(session, { assetId: USDC_NEAR, amount: "9" });
    await expect(closePayLink(other, link.code)).rejects.toThrow(/not found/);
    await closePayLink(session, link.code);
    expect((await listPayLinks(session))[0].status).toBe("closed");
    await expect(linkRow(link.code)).rejects.toThrow(/no longer open/);
  });
});

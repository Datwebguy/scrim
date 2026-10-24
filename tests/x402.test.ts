// x402 for payment links, against the real NEAR Intents service. No money moves: quotes are real,
// deposits are not made. The quote and deposit steps need the partner key and are skipped without it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Session } from "@/server/auth";
import { catalog } from "@/server/assets";
import { sql } from "@/server/db";
import { createPayLink } from "@/server/paylinks";
import { checkToken, decodeHeader, encodeHeader, handleX402, issueToken } from "@/server/x402";
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

// Runs against real NEAR mainnet and the real NEAR Intents service. These tests move no money:
// the account is a brand-new implicit account that holds nothing. Tests that need NEAR Intents' partner
// key run only when ONECLICK_API_KEY is set, and are reported as skipped otherwise.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import { createSignInChallenge, signIn, type Session } from "@/server/auth";
import { assetById, catalog, checkAddress } from "@/server/assets";
import { overview } from "@/server/balances";
import { sql } from "@/server/db";
import { createPayLink, linkRow, publicLink } from "@/server/paylinks";
import { privateAccessToken } from "@/server/private-access";
import { bridgeDepositAddress, balances } from "@/server/oneclick";
import { createLinkPayment, createTransfer, listTransfers, preview } from "@/server/transfers";
import { mainnetImplicitWallet, resetDatabase, signInAs, type Wallet } from "./live";

const hasKey = Boolean(process.env.ONECLICK_API_KEY);
let wallet: Wallet, session: Session;

beforeAll(async () => {
  await resetDatabase();
  wallet = mainnetImplicitWallet();
  const result = await signInAs(wallet);
  session = result.session;
}, 60_000);
afterAll(() => sql.end());

describe("sign-in on mainnet", () => {
  it("signs in with a plain message that names Scrim and the site, and unlocks the private balance as a separate step", async () => {
    const again = mainnetImplicitWallet();
    const challenge = await createSignInChallenge(again.accountId, "mainnet");
    expect(challenge.message).toContain("Sign in to Scrim");
    expect(challenge.message).toContain(`Site: ${challenge.recipient}`);
    expect(challenge.recipient).not.toBe("intents.near");
    const first = await signIn(again.sign(challenge));
    expect(first.privateStatus).toBe("none");
    const { privateStatus, session: s } = await signInAs(again);
    expect(s.network).toBe("mainnet");
    expect(privateStatus).toBe("active");
  });

  it("reads the real private balance of a new account: empty", async () => {
    const o = await overview(session);
    expect(o.status).toBe("active");
    expect(o.holdings).toEqual([]);
    expect(o.totalUsd).toBe(0);
    expect((await balances(await privateAccessToken(session))).balances).toEqual([]);
  });

  it("rejects an implicit account claimed with someone else's key", async () => {
    const other = mainnetImplicitWallet();
    const envelope = { ...other.sign(await createSignInChallenge(wallet.accountId, "mainnet")), accountId: wallet.accountId };
    await expect(signIn(envelope)).rejects.toThrow(/not a full-access key/);
  });

  it("rejects a tampered signature and a replay", async () => {
    const w = mainnetImplicitWallet();
    const envelope = w.sign(await createSignInChallenge(w.accountId, "mainnet"));
    await expect(signIn({ ...envelope, signature: Buffer.alloc(64, 1).toString("base64") })).rejects.toThrow(/Signature verification failed/);
    await signIn(envelope);
    await expect(signIn(envelope)).rejects.toThrow(/expired or was already used/);
  });
});

describe("the real coin list", () => {
  it("lists real coins on real chains with live prices", async () => {
    const assets = await catalog();
    expect(assets.length).toBeGreaterThan(100);
    expect(new Set(assets.map((a) => a.chain)).size).toBeGreaterThan(25);
    const btc = assets.find((a) => a.symbol === "BTC" && a.chain === "btc")!;
    expect(btc.decimals).toBe(8);
    expect(btc.priceUsd).toBeGreaterThan(1000);
  }, 60_000);

  it("has real logos and names from live sources", async () => {
    const assets = await catalog();
    const btc = assets.find((a) => a.symbol === "BTC" && a.chain === "btc")!;
    expect(btc.icon).toMatch(/^https:\/\/.+\.(png|jpg|jpeg|webp|svg)/);
    expect(btc.chainIcon).toMatch(/^https:\/\//);
    const base = assets.find((a) => a.chain === "base")!;
    expect(base.chainName).toBe("Base");
    expect(assets.find((a) => a.chain === "arb")!.chainName).toMatch(/Arbitrum/);
    const withLogos = assets.filter((a) => a.icon).length;
    expect(withLogos / assets.length).toBeGreaterThan(0.9);
  }, 60_000);

  it("checks addresses by the chain they belong to", async () => {
    const base = (await catalog()).find((a) => a.chain === "base")!;
    const btc = (await catalog()).find((a) => a.chain === "btc" && a.symbol === "BTC")!;
    expect(checkAddress(base, "0x2A9B8E3A4C5F0E1D7B6A8C9D0E1F2A3B4C5D6E7F")).toMatch(/^0x/);
    expect(() => checkAddress(base, "0x123")).toThrow(/Base address/);
    expect(() => checkAddress(btc, "not-a-bitcoin-address")).toThrow(/Bitcoin address/);
    await expect(assetById("nep141:does-not-exist")).rejects.toThrow(/not supported/);
  }, 60_000);

  it("gets real one-time deposit addresses from the bridge", async () => {
    const assets = await catalog();
    for (const chain of ["btc", "sol"]) {
      const asset = assets.find((a) => a.chain === chain && a.depositChain)!;
      const result = await bridgeDepositAddress(wallet.accountId, asset.depositChain!);
      expect(result.address.length).toBeGreaterThan(20);
    }
  }, 60_000);
});

describe.skipIf(!hasKey)("moving money (needs the partner key)", () => {
  it("creates a one-time deposit address to add money, with no funds needed", async () => {
    const btc = (await catalog()).find((a) => a.chain === "btc" && a.symbol === "BTC" && a.depositChain)!;
    const t = await createTransfer(session, { kind: "add", fromAssetId: btc.assetId, amount: "0" });
    expect(t.status).toBe("awaiting_deposit");
    expect(t.deposit?.chainName).toBe("Bitcoin");
    expect((await listTransfers(session)).map((x) => x.id)).toContain(t.id);
  }, 60_000);

  it("refuses bad recipients and amounts before asking the network", async () => {
    const assets = await catalog();
    const usdc = assets.find((a) => a.symbol === "USDC" && a.chain === "near")!;
    const base = assets.find((a) => a.symbol === "USDC" && a.chain === "base")!;
    await expect(preview(session, { kind: "send", fromAssetId: usdc.assetId, amount: "1", recipient: "Not A Name!" })).rejects.toThrow(/NEAR account/);
    await expect(preview(session, { kind: "withdraw", fromAssetId: usdc.assetId, toAssetId: base.assetId, amount: "1", recipient: "0x123" })).rejects.toThrow(/Base address/);
    await expect(preview(session, { kind: "swap", fromAssetId: usdc.assetId, toAssetId: usdc.assetId, amount: "1" })).rejects.toThrow(/two different/);
  }, 60_000);

  it("makes a payment link that anyone can pay from another chain", async () => {
    const usdc = (await catalog()).find((a) => a.symbol === "USDC" && a.chain === "near")!;
    const btc = (await catalog()).find((a) => a.chain === "btc" && a.symbol === "BTC" && a.depositChain)!;
    const link = await createPayLink(session, { assetId: usdc.assetId, amount: "25", note: "Test request", days: 1 });
    const view = await publicLink(link.code);
    expect(view).toMatchObject({ symbol: "USDC", status: "open" });
    const payment = await createLinkPayment(await linkRow(link.code), { fromAssetId: btc.assetId, refundAddress: "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq" });
    expect(payment.status).toBe("awaiting_deposit");
    expect(payment.deposit?.address.length).toBeGreaterThan(20);
  }, 90_000);
});

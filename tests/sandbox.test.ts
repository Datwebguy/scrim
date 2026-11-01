// Sign-in against a local NEAR chain (near-kit's sandbox), the mainnet way and the testnet way: named
// accounts whose keys really sit on chain, read back by Scrim over RPC. Runs where the sandbox runs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { Network } from "@/protocol/networks";
import { creditWalletTopUp } from "@/server/ask-credits";
import { catalog } from "@/server/assets";
import { createSignInChallenge, signIn } from "@/server/auth";
import { sql } from "@/server/db";
import { NEAR, addSandboxKey, resetDatabase, sandbox, sandboxCall, sandboxToken, sandboxWallet, walletFor } from "./live";

describe.skipIf(!sandbox)("sign-in on a local NEAR chain", () => {
  const before = process.env.NEAR_RPC_URL_MAINNET;
  const feeBefore = process.env.ASK_FEE_ACCOUNT;
  beforeAll(async () => {
    process.env.NEAR_RPC_URL_MAINNET = sandbox!.rpcUrl; // this file only: mainnet accounts live on the local chain too
    await resetDatabase();
  });
  afterAll(async () => {
    if (before === undefined) delete process.env.NEAR_RPC_URL_MAINNET; else process.env.NEAR_RPC_URL_MAINNET = before;
    if (feeBefore === undefined) delete process.env.ASK_FEE_ACCOUNT; else process.env.ASK_FEE_ACCOUNT = feeBefore;
    await sql.end();
  });

  for (const network of ["mainnet", "testnet"] as Network[]) {
    it(`signs in a named ${network} account with a key that is on chain`, async () => {
      const wallet = await sandboxWallet("scrim-sbx", network);
      const { session } = await signIn(wallet.sign(await createSignInChallenge(wallet.accountId, network)));
      expect(session).toMatchObject({ accountId: wallet.accountId, network });
    });

    it(`refuses a ${network} key that isn't on the account, and a key limited to one contract`, async () => {
      const wallet = await sandboxWallet("scrim-sbx-key", network);
      const stranger = walletFor(wallet.accountId, network, ed25519.utils.randomSecretKey());
      await expect(signIn(stranger.sign(await createSignInChallenge(wallet.accountId, network)))).rejects.toThrow(/full-access key/);
      const limitedSecret = ed25519.utils.randomSecretKey();
      await addSandboxKey(wallet.accountId, limitedSecret, { receiver_id: "intents.near" });
      const limited = walletFor(wallet.accountId, network, limitedSecret);
      await expect(signIn(limited.sign(await createSignInChallenge(wallet.accountId, network)))).rejects.toThrow(/full-access key/);
    });
  }

  it("moves real NEAR between two accounts on the local chain", async () => {
    const [a, b] = await Promise.all([sandboxWallet("scrim-sbx-a", "testnet"), sandboxWallet("scrim-sbx-b", "testnet")]);
    const hash = await a.send(b.accountId, 10n ** 24n);
    expect(hash).toMatch(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/);
  });

  // A stand-in for USDC on NEAR: a real token contract placed at USDC's own contract ID on the local chain.
  it("credits Ask from a USDC payment in the person's wallet, read back from the chain, and only once", async () => {
    const usdcId = (await catalog()).find((a) => a.chain === "near" && a.symbol === "USDC")!.assetId.replace(/^nep141:/, "");
    await sandboxToken(usdcId);
    const [alice, site, bob] = await Promise.all([sandboxWallet("scrim-sbx-alice", "mainnet"), sandboxWallet("scrim-sbx-site", "mainnet"), sandboxWallet("scrim-sbx-bob", "mainnet")]);
    process.env.ASK_FEE_ACCOUNT = site.accountId;
    const storage = 1_250_000_000_000_000_000_000n;
    for (const who of [alice, site]) await sandboxCall(alice, usdcId, "storage_deposit", { account_id: who.accountId }, storage);
    await sandboxCall(alice, usdcId, "near_deposit", {}, NEAR(1));
    const pay = (micros: string) => sandboxCall(alice, usdcId, "ft_transfer", { receiver_id: site.accountId, amount: micros }, 1n);

    const session = (await signIn(alice.sign(await createSignInChallenge(alice.accountId, "mainnet")))).session;
    const paid = await pay("2000000"); // $2
    expect((await creditWalletTopUp(session, paid)).creditUsd).toBe(2);
    expect((await creditWalletTopUp(session, paid)).creditUsd).toBe(2); // the same payment is credited once

    await expect(creditWalletTopUp(session, await pay("500000"))).rejects.toThrow(/at least \$1/);
    await expect(creditWalletTopUp(session, await alice.send(site.accountId, NEAR(1)))).rejects.toThrow(/USDC payment/);
    const bobSession = (await signIn(bob.sign(await createSignInChallenge(bob.accountId, "mainnet")))).session;
    await expect(creditWalletTopUp(bobSession, await pay("3000000"))).rejects.toThrow(); // someone else's payment
  });
});

// Sign-in against a local NEAR chain (near-kit's sandbox), the mainnet way and the testnet way: named
// accounts whose keys really sit on chain, read back by Scrim over RPC. Runs where the sandbox runs.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ed25519 } from "@noble/curves/ed25519.js";
import type { Network } from "@/protocol/networks";
import { createSignInChallenge, signIn } from "@/server/auth";
import { sql } from "@/server/db";
import { addSandboxKey, resetDatabase, sandbox, sandboxWallet, walletFor } from "./live";

describe.skipIf(!sandbox)("sign-in on a local NEAR chain", () => {
  const before = process.env.NEAR_RPC_URL_MAINNET;
  beforeAll(async () => {
    process.env.NEAR_RPC_URL_MAINNET = sandbox!.rpcUrl; // this file only: mainnet accounts live on the local chain too
    await resetDatabase();
  });
  afterAll(async () => {
    if (before === undefined) delete process.env.NEAR_RPC_URL_MAINNET; else process.env.NEAR_RPC_URL_MAINNET = before;
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
});

// What an email account may send from its own balance: plain payments only, signed with the account's key.
import { createHash } from "node:crypto";
import { ed25519 } from "@noble/curves/ed25519.js";
import bs58 from "bs58";
import { decodeSignedTransaction } from "near-api-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { allowedActions, signedTransaction, type WalletAction } from "@/server/email-send";

const call = (methodName: string, args: Record<string, unknown>, extra: { gas?: string; deposit?: string } = {}): WalletAction => ({
  type: "FunctionCall", params: { methodName, args, gas: extra.gas ?? "20000000000000", deposit: extra.deposit ?? "1" },
});
const register = (account: string) => call("storage_deposit", { account_id: account, registration_only: true }, { gas: "10000000000000", deposit: "1250000000000000000000" });
const transfer = (receiver: string, amount: string) => call("ft_transfer", { receiver_id: receiver, amount });
const refuses = (receiver: string, actions: WalletAction[], network: "mainnet" | "testnet" = "mainnet") => expect(() => allowedActions(network, receiver, actions)).toThrow();

describe("an email account sends plain payments", () => {
  it("sends NEAR", () => {
    const out = allowedActions("mainnet", "Friend.near", [{ type: "Transfer", params: { deposit: "1000000000000000000000000" } }]);
    expect(out.receiverId).toBe("friend.near");
    expect(out.actions).toHaveLength(1);
  });

  it("sends a token, registering the receiver first", () => {
    expect(allowedActions("mainnet", "usdc.near", [register("friend.near"), transfer("friend.near", "2500000")]).actions).toHaveLength(2);
  });

  it("wraps NEAR on the wrapped NEAR contract, then sends it", () => {
    const wrap = call("near_deposit", {}, { gas: "10000000000000", deposit: "5000000000000000000000000" });
    expect(allowedActions("mainnet", "wrap.near", [register("me.near"), wrap, register("dep"), transfer("dep", "5")]).actions).toHaveLength(4);
    expect(allowedActions("testnet", "wrap.testnet", [wrap]).actions).toHaveLength(1);
  });
});

describe("an email account never signs anything else", () => {
  it("refuses keys, contracts, staking and deleting the account", () => {
    for (const type of ["AddKey", "DeleteKey", "DeployContract", "Stake", "DeleteAccount", "CreateAccount"]) refuses("me.near", [{ type, params: {} }]);
  });

  it("refuses other calls, even on a token contract", () => {
    for (const name of ["ft_transfer_call", "storage_withdraw", "storage_unregister", "add_public_key", "withdraw", "set_owner", "burn"]) refuses("usdc.near", [call(name, {})]);
  });

  it("refuses a token transfer with extra fields, a different deposit, or too much gas", () => {
    refuses("usdc.near", [call("ft_transfer", { receiver_id: "a.near", amount: "5", msg: "x" })]);
    refuses("usdc.near", [call("ft_transfer", { receiver_id: "a.near", amount: "5" }, { deposit: "2" })]);
    refuses("usdc.near", [call("ft_transfer", { receiver_id: "a.near", amount: "5" }, { gas: "300000000000000" })]);
    refuses("usdc.near", [call("ft_transfer", { receiver_id: "a.near", amount: "-5" })]);
    refuses("usdc.near", [call("ft_transfer", { receiver_id: "NOT A NAME!", amount: "5" })]);
  });

  it("refuses a registration that takes more than the usual deposit, or wrapping on any other contract", () => {
    refuses("usdc.near", [call("storage_deposit", { account_id: "a.near", registration_only: true }, { deposit: "5000000000000000000000000" })]);
    refuses("usdc.near", [call("storage_deposit", { account_id: "a.near", registration_only: false })]);
    refuses("evil.near", [call("near_deposit", {}, { deposit: "1000" })]);
    refuses("wrap.testnet", [call("near_deposit", {}, { deposit: "1000" })], "mainnet");
  });

  it("refuses a zero amount, an empty request, a long one and a recipient that isn't an account", () => {
    refuses("a.near", [{ type: "Transfer", params: { deposit: "0" } }]);
    refuses("a.near", [{ type: "Transfer", params: { deposit: "1.5" } }]);
    refuses("a.near", []);
    refuses("a.near", Array.from({ length: 7 }, () => ({ type: "Transfer", params: { deposit: "1" } })));
    refuses("Not A Name!", [{ type: "Transfer", params: { deposit: "1" } }]);
  });

  it("refuses a request whose calls ask for far more gas than a payment needs", () => {
    refuses("usdc.near", [transfer("a.near", "1"), transfer("b.near", "1"), transfer("c.near", "1"), ...Array.from({ length: 3 }, () => call("ft_transfer", { receiver_id: "d.near", amount: "1" }, { gas: "50000000000000" }))]);
  });
});

describe("the transaction an email account signs", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is the payment that was asked for, signed by the account's key", async () => {
    const secret = ed25519.utils.randomSecretKey();
    const publicKey = ed25519.getPublicKey(secret);
    const accountId = Buffer.from(publicKey).toString("hex");
    const blockHash = bs58.encode(new Uint8Array(32).fill(9));
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: "scrim", result: { nonce: 41, block_hash: blockHash, permission: "FullAccess" } })));

    const { receiverId, actions } = allowedActions("mainnet", "friend.near", [{ type: "Transfer", params: { deposit: "7" } }]);
    let signedHash: Uint8Array = new Uint8Array();
    const bytes = await signedTransaction("mainnet", accountId, `ed25519:${bs58.encode(publicKey)}`, receiverId, actions, async (hash) => { signedHash = hash; return ed25519.sign(hash, secret); });

    const decoded = decodeSignedTransaction(bytes);
    expect(decoded.transaction.signerId).toBe(accountId);
    expect(decoded.transaction.receiverId).toBe("friend.near");
    expect(decoded.transaction.nonce).toBe(42n);
    expect(decoded.transaction.actions).toHaveLength(1);
    expect(Buffer.from(signedHash).toString("hex")).toBe(createHash("sha256").update(decoded.transaction.encode()).digest("hex"));
    expect(ed25519.verify(Uint8Array.from(decoded.signature.ed25519Signature!.data), signedHash, publicKey)).toBe(true);
  });

  it("says so, in plain words, when the account has nothing on chain yet", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ jsonrpc: "2.0", id: "scrim", error: { cause: { name: "UNKNOWN_ACCESS_KEY" } } })));
    const key = ed25519.getPublicKey(ed25519.utils.randomSecretKey());
    await expect(signedTransaction("mainnet", "a".repeat(64), `ed25519:${bs58.encode(key)}`, "friend.near", allowedActions("mainnet", "friend.near", [{ type: "Transfer", params: { deposit: "1" } }]).actions, async () => new Uint8Array(64)))
      .rejects.toThrow(/nothing on mainnet yet/);
  });
});

// The Solana deposit transaction, built and read back byte by byte: what a wallet is asked to sign.
import { address, getCompiledTransactionMessageDecoder, getTransactionDecoder, generateKeyPairSigner } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";
import { describe, expect, it } from "vitest";
import { buildDepositTransaction, isSolanaAddress } from "@/client/solana-tx";

const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const BLOCKHASH = "4vJ9JU1bJJE96FWSJKvHsmmFADCg4gpZQff4P3bkLKi";

async function read(bytes: Uint8Array) {
  const tx = getTransactionDecoder().decode(bytes);
  const message = getCompiledTransactionMessageDecoder().decode(tx.messageBytes);
  return {
    accounts: message.staticAccounts,
    signatures: Object.keys(tx.signatures),
    feePayer: message.staticAccounts[0],
    instructions: message.instructions.map((i) => ({ program: message.staticAccounts[i.programAddressIndex], data: Array.from(i.data ?? []), accounts: (i.accountIndices ?? []).map((n) => message.staticAccounts[n]) })),
  };
}

describe("paying a Solana deposit address from a wallet", () => {
  it("sends the coin itself with a single System transfer", async () => {
    const payer = (await generateKeyPairSigner()).address;
    const to = (await generateKeyPairSigner()).address;
    const bytes = await buildDepositTransaction({ payer, to, amount: 1_250_000n, blockhash: BLOCKHASH, lastValidBlockHeight: 10n, mint: null, decimals: 9 });
    const { instructions, feePayer, signatures } = await read(bytes);
    expect(feePayer).toBe(payer);
    expect(signatures).toEqual([payer]); // one signature is wanted, and it is the wallet's
    expect(instructions).toHaveLength(1);
    expect(instructions[0].program).toBe("11111111111111111111111111111111");
    expect(instructions[0].accounts).toEqual([payer, to]);
    expect(instructions[0].data).toEqual([2, 0, 0, 0, ...new Uint8Array(new BigUint64Array([1_250_000n]).buffer)]);
  });

  it("sends a token to the deposit address's own token account, creating it only if it is missing", async () => {
    const payer = (await generateKeyPairSigner()).address;
    const to = (await generateKeyPairSigner()).address;
    const bytes = await buildDepositTransaction({ payer, to, amount: 2_500_000n, blockhash: BLOCKHASH, lastValidBlockHeight: 10n, mint: USDC, decimals: 6 });
    const { instructions } = await read(bytes);
    const [mine] = await findAssociatedTokenPda({ owner: payer, mint: address(USDC), tokenProgram: TOKEN_PROGRAM_ADDRESS });
    const [theirs] = await findAssociatedTokenPda({ owner: to, mint: address(USDC), tokenProgram: TOKEN_PROGRAM_ADDRESS });

    expect(instructions).toHaveLength(2);
    expect(instructions[0].program).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
    expect(instructions[0].data).toEqual([1]); // "create if missing", never fails when it exists
    expect(instructions[0].accounts).toContain(theirs);

    expect(instructions[1].program).toBe(TOKEN_PROGRAM_ADDRESS);
    expect(instructions[1].data[0]).toBe(12); // TransferChecked: the wallet shows the amount and checks the decimals
    expect(Buffer.from(instructions[1].data.slice(1, 9)).readBigUInt64LE()).toBe(2_500_000n);
    expect(instructions[1].data[9]).toBe(6);
    expect(instructions[1].accounts).toEqual([mine, address(USDC), theirs, payer]);
  });

  it("refuses an empty amount and a bad address", async () => {
    const payer = (await generateKeyPairSigner()).address;
    await expect(buildDepositTransaction({ payer, to: payer, amount: 0n, blockhash: BLOCKHASH, lastValidBlockHeight: 1n, mint: null, decimals: 9 })).rejects.toThrow(/amount/i);
    await expect(buildDepositTransaction({ payer, to: "not-an-address", amount: 1n, blockhash: BLOCKHASH, lastValidBlockHeight: 1n, mint: null, decimals: 9 })).rejects.toThrow();
    expect(isSolanaAddress(USDC)).toBe(true);
    expect(isSolanaAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toBe(false);
  });
});

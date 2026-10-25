// The transaction a Solana wallet signs to pay a one-time deposit address: the coin itself, or an SPL token
// (USDC and the like). Pure: it builds bytes and sends nothing.
import {
  address, appendTransactionMessageInstructions, compileTransaction, createNoopSigner, createTransactionMessage,
  getAddressEncoder, getTransactionEncoder, pipe, setTransactionMessageFeePayer, setTransactionMessageLifetimeUsingBlockhash,
  type Address, type Blockhash, type Instruction,
} from "@solana/kit";
import { findAssociatedTokenPda, getCreateAssociatedTokenIdempotentInstructionAsync, getTransferCheckedInstruction, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token";

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

// Native SOL: the System program's Transfer instruction (index 2, then lamports as a little-endian u64).
function transferSol(from: Address, to: Address, lamports: bigint): Instruction {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: from, role: 3 /* writable signer */ },
      { address: to, role: 1 /* writable */ },
    ],
    data,
  } as Instruction;
}

export type DepositInput = {
  payer: string;
  to: string;
  amount: bigint;
  blockhash: string;
  lastValidBlockHeight: bigint;
  /** The token's mint address; null for the coin itself. */
  mint: string | null;
  decimals: number;
  /** The program that owns the mint (the classic Token program unless told otherwise). */
  tokenProgram?: string;
};

export async function buildDepositTransaction(input: DepositInput): Promise<Uint8Array> {
  const payer = address(input.payer);
  const to = address(input.to);
  if (input.amount <= 0n) throw new Error("Enter an amount.");
  const instructions: Instruction[] = [];
  if (input.mint === null) {
    instructions.push(transferSol(payer, to, input.amount));
  } else {
    const mint = address(input.mint);
    const tokenProgram = address(input.tokenProgram ?? TOKEN_PROGRAM_ADDRESS);
    const signer = createNoopSigner(payer);
    const [source] = await findAssociatedTokenPda({ owner: payer, mint, tokenProgram });
    const [destination] = await findAssociatedTokenPda({ owner: to, mint, tokenProgram });
    // Safe to repeat: it only creates the deposit address's token account when it doesn't exist yet.
    instructions.push(await getCreateAssociatedTokenIdempotentInstructionAsync({ payer: signer, owner: to, mint, tokenProgram }));
    instructions.push(getTransferCheckedInstruction({ source, mint, destination, authority: signer, amount: input.amount, decimals: input.decimals }, { programAddress: tokenProgram }));
  }
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(payer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash({ blockhash: input.blockhash as Blockhash, lastValidBlockHeight: input.lastValidBlockHeight }, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  return new Uint8Array(getTransactionEncoder().encode(compileTransaction(message)));
}

// Whether text is a Solana address (32 bytes, base58).
export function isSolanaAddress(value: string): boolean {
  try {
    return getAddressEncoder().encode(address(value)).length === 32;
  } catch {
    return false;
  }
}

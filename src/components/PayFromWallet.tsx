"use client";
import { useEffect, useState } from "react";
import { encodeFunctionData, erc20Abi } from "viem";
import { parseAmount } from "@/protocol/amount";
import { Spinner } from "./ui";

type Eip1193 = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const browserWallet = () => (typeof window === "undefined" ? null : ((window as unknown as { ethereum?: Eip1193 }).ethereum ?? null));

// One tap instead of copying the address: the browser wallet (MetaMask, Rabby, Coinbase Wallet, or a wallet
// app's own browser) sends the deposit to Scrim's one-time address on the right chain.
export function PayFromWallet({ to, chainId, token, symbol, decimals, minimum, exact }: { to: string; chainId: number; token: `0x${string}` | null; symbol: string; decimals: number; minimum: string | null; exact?: string }) {
  const [wallet, setWallet] = useState<Eip1193 | null>(null);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  useEffect(() => setWallet(browserWallet()), []);

  if (!wallet) return <p className="muted small-print">On your phone? Open Scrim in your wallet app&apos;s browser to pay this in one tap.</p>;

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const value = exact ? BigInt(exact) : parseAmount(amount, decimals);
      if (value <= 0n) throw new Error("Enter an amount.");
      if (minimum && value < BigInt(minimum)) throw new Error("That's below the minimum for this deposit.");
      const [from] = (await wallet!.request({ method: "eth_requestAccounts" })) as string[];
      const hex = `0x${chainId.toString(16)}`;
      try {
        await wallet!.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hex }] });
      } catch (e) {
        if ((e as { code?: number }).code === 4902) throw new Error("Add this network to your wallet first, then try again.");
        throw e;
      }
      const tx = token
        ? { from, to: token, data: encodeFunctionData({ abi: erc20Abi, functionName: "transfer", args: [to as `0x${string}`, value] }) }
        : { from, to, value: `0x${value.toString(16)}` };
      setHash((await wallet!.request({ method: "eth_sendTransaction", params: [tx] })) as string);
    } catch (e) {
      const err = e as { code?: number; message?: string };
      setError(err.code === 4001 ? "You cancelled in your wallet." : err.message ?? "Your wallet couldn't send it.");
    } finally {
      setBusy(false);
    }
  }

  if (hash) return <div className="notice good">Sent from your wallet. It lands in your private balance in a few minutes; this page updates by itself.</div>;
  return (
    <div className="form-grid">
      <span className="section-label">Or pay from a connected wallet</span>
      <div className="connect-row">
        {!exact && <input className="input" inputMode="decimal" placeholder={`Amount in ${symbol}`} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />}
        <button className="btn btn-primary" onClick={pay} disabled={busy || (!exact && !amount.trim())}>{busy ? <Spinner /> : "Pay from my wallet"}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

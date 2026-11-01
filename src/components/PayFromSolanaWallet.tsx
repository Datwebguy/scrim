"use client";
import { useEffect, useState } from "react";
import { parseAmount } from "@/protocol/amount";
import { onSolanaWallets, payWithSolana, solanaWallets, type SolanaWallet } from "@/client/solana-wallet";
import { Spinner } from "./ui";
import { useT } from "@/i18n/I18n";

// One tap instead of copying the address: a Solana wallet in this browser (Phantom, Solflare, Backpack, or a
// wallet app's own browser) sends the deposit to Scrim's one-time address.
export function PayFromSolanaWallet({ to, mint, symbol, decimals, minimum, exact }: { to: string; mint: string | null; symbol: string; decimals: number; minimum: string | null; exact?: string }) {
  const t = useT();
  const [wallets, setWallets] = useState<SolanaWallet[]>([]);
  const [chosen, setChosen] = useState(0);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  useEffect(() => {
    const read = () => setWallets(solanaWallets());
    read();
    return onSolanaWallets(read);
  }, []);

  if (wallets.length === 0) return null;
  const wallet = wallets[Math.min(chosen, wallets.length - 1)];

  async function pay() {
    setBusy(true);
    setError("");
    try {
      const value = exact ? BigInt(exact) : parseAmount(amount, decimals);
      if (value <= 0n) throw new Error(t("Enter an amount."));
      if (minimum && value < BigInt(minimum)) throw new Error(t("That's below the minimum for this deposit."));
      await payWithSolana(wallet.wallet, { to, mint, decimals, amount: value });
      setSent(true);
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      setError(/reject|cancel|denied|declin|user/i.test(message) ? "You cancelled in your wallet." : message || "Your wallet couldn't send it.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <div className="notice good">{t("Sent from your wallet. It arrives in a few minutes; this page updates by itself.")}</div>;
  return (
    <div className="form-grid">
      <span className="section-label">{t("Or pay from your Solana wallet")}</span>
      {wallets.length > 1 && (
        <select className="select" value={chosen} onChange={(e) => setChosen(Number(e.target.value))} disabled={busy} aria-label="Wallet">
          {wallets.map((w, i) => <option key={w.name} value={i}>{w.name}</option>)}
        </select>
      )}
      <div className="connect-row">
        {!exact && <input className="input" inputMode="decimal" placeholder={`Amount in ${symbol}`} value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy} />}
        <button className="btn btn-primary" onClick={pay} disabled={busy || (!exact && !amount.trim())}>{busy ? <Spinner /> : `Pay with ${wallet.name}`}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}

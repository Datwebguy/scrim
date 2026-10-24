"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { sendNear } from "@/client/wallet";
import { parseAmount } from "@/protocol/amount";
import { NETWORK_INFO } from "@/protocol/networks";
import { Heading } from "./money";
import { useSession } from "./session";
import { Spinner } from "./ui";

// A plain on-chain transfer of NEAR. On testnet this is how you rehearse paying someone.
export function SendNear() {
  const { network } = useSession();
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setHash("");
    try {
      const yocto = parseAmount(amount, 24);
      if (yocto <= 0n) throw new Error("Amount must be greater than zero.");
      const check = await api<{ accountId: string; exists: boolean }>(`/accounts/check?id=${encodeURIComponent(to.trim().toLowerCase())}`);
      if (!check.exists) throw new Error(`${check.accountId} doesn't exist on ${NETWORK_INFO[network].label.toLowerCase()}. Check the spelling.`);
      setHash(await sendNear(network, check.accountId, yocto.toString()));
      setAmount("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <Heading eyebrow="Send" title="Send test NEAR" text="This is a normal blockchain transfer, so it is public. On mainnet, Send pays privately." />
      <form className="card card-pad form-grid" onSubmit={submit}>
        <label className="field">Send to<small>A NEAR testnet account</small>
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} placeholder="account.testnet" autoComplete="off" spellCheck={false} required /></label>
        <label className="field">Amount
          <span className="input-affix"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required /><span>NEAR</span></span></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        {hash && <div className="notice good">Sent. <a href={`${NETWORK_INFO[network].explorerUrl}/txns/${hash}`} target="_blank" rel="noreferrer">See it on the explorer ↗</a></div>}
        <button className="btn btn-primary btn-lg" disabled={busy}>{busy && <Spinner />} Send with my wallet</button>
        <p className="muted small-print">Your wallet asks you to approve the exact amount and recipient.</p>
      </form>
    </div>
  );
}

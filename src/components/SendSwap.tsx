"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { sendNear, sendToken, signTransfer } from "@/client/wallet";
import { parseAmount } from "@/protocol/amount";
import { AssetPicker, fmt, Heading, StateChip, usd, useAssets, type AssetInfo, type TransferView } from "./money";
import { useSession } from "./session";
import { Spinner, useToast } from "./ui";

type Mode = "swap" | "person" | "address";
type Holding = { assetId: string; symbol: string; chainName: string; amount: string; display: string };
type Source = "private" | "wallet";
type WalletHolding = { id: string; symbol: string; decimals: number; amount: string; display: string };
// A wallet coin as NEAR Intents names it: the wallet's own NEAR travels as wrapped NEAR.
const walletAssetId = (id: string) => `nep141:${id === "near" ? "wrap.near" : id}`;
// NEAR kept back for network fees and token registration when paying with the wallet's own NEAR.
const NEAR_RESERVE = 5n * 10n ** 22n; // 0.05 NEAR
const spendable = (h: WalletHolding) => (h.id === "near" ? (BigInt(h.amount) > NEAR_RESERVE ? BigInt(h.amount) - NEAR_RESERVE : 0n) : BigInt(h.amount));
const TERMINAL = new Set(["success", "refunded", "failed", "expired", "cancelled"]);

export function SendSwap({ initial }: { initial: Mode }) {
  const { accountId, network } = useSession();
  const toast = useToast();
  const assets = useAssets();
  const { data: priv } = useApi<{ status: string; holdings: Holding[] }>("/private");
  const [mode, setMode] = useState<Mode>(initial);
  // Private balance or the NEAR wallet: the person picks each time. The wallet pays in public.
  const [source, setSource] = useState<Source>("private");
  const fromWallet = source === "wallet";
  const { data: pub, reload: reloadWallet } = useApi<{ holdings: WalletHolding[] }>(network === "mainnet" ? "/wallet" : null);
  const [sentHash, setSentHash] = useState("");
  // A wallet payment already sent for this transfer: reporting it again never pays twice.
  const [paidTx, setPaidTx] = useState("");
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"" | "price" | "send">("");
  const [error, setError] = useState("");
  const [transfer, setTransfer] = useState<TransferView | null>(null);

  const holdings: Holding[] = useMemo(() => fromWallet
    // Wrapped NEAR is listed as NEAR: the wallet's own NEAR is what pays.
    ? (pub?.holdings ?? []).filter((h) => h.id !== "wrap.near").map((h) => ({ assetId: walletAssetId(h.id), symbol: h.symbol, chainName: "NEAR", amount: spendable(h).toString(), display: h.display }))
    : priv?.holdings ?? [], [fromWallet, pub, priv]);
  const ready = fromWallet ? Boolean(pub) : priv?.status === "active";
  const fromAssets = useMemo(() => assets.filter((a) => holdings.some((h) => h.assetId === a.assetId)), [assets, holdings]);
  const from = assets.find((a) => a.assetId === fromId);
  const to = assets.find((a) => a.assetId === (mode === "swap" || mode === "address" ? toId : fromId));
  const held = holdings.find((h) => h.assetId === fromId);

  useEffect(() => {
    if (!fromId && holdings.length && fromAssets.length) setFromId(holdings.find((h) => fromAssets.some((a) => a.assetId === h.assetId))?.assetId ?? fromAssets[0].assetId);
  }, [fromId, fromAssets, holdings]);
  useEffect(() => { setFromId(""); setToId(""); setSentHash(""); }, [source]);

  useEffect(() => {
    if (!transfer || TERMINAL.has(transfer.status) || transfer.status === "awaiting_signature") return;
    const timer = setInterval(async () => {
      try { setTransfer((await api<{ transfer: TransferView }>(`/transfers/${transfer.id}`)).transfer); } catch { /* keep last state */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [transfer]);

  const kind = mode === "swap" ? "swap" : mode === "person" ? "send" : "withdraw";

  async function getPrice() {
    setBusy("price");
    setError("");
    try {
      if (fromWallet && mode === "person") return await sendDirect();
      const body = { kind, fromAssetId: fromId, toAssetId: mode === "person" ? fromId : toId, amount, recipient, note, privacy: fromWallet ? "public" : "private" };
      setTransfer((await api<{ transfer: TransferView }>("/transfers", { body })).transfer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a price.");
    } finally {
      setBusy("");
    }
  }

  // From the wallet to a NEAR account: an ordinary transfer the wallet signs. Nothing goes through Scrim.
  async function sendDirect() {
    const coin = (pub?.holdings ?? []).find((h) => h.id !== "wrap.near" && walletAssetId(h.id) === fromId);
    if (!coin) throw new Error("Choose a coin your wallet holds.");
    const minor = parseAmount(amount, coin.decimals);
    if (minor <= 0n) throw new Error("Enter an amount.");
    if (minor > spendable(coin)) throw new Error(coin.id === "near" ? "Keep about 0.05 NEAR in your wallet for network fees. Lower the amount." : `Your wallet holds ${coin.display} ${coin.symbol}.`);
    // Tokens sent to an account that doesn't exist are lost, so check it first.
    const check = await api<{ accountId: string; exists: boolean }>(`/accounts/check?id=${encodeURIComponent(recipient.trim().toLowerCase())}`);
    if (!check.exists) throw new Error(`${check.accountId} doesn't exist. Check the spelling.`);
    if (check.accountId === accountId) throw new Error("That's your own account.");
    setSentHash(coin.id === "near" ? await sendNear(network, check.accountId, minor.toString()) : await sendToken(network, coin.id, check.accountId, minor.toString()));
    setAmount("");
    reloadWallet();
  }

  // From the wallet to any chain or into another coin: the wallet pays the one-time deposit address.
  async function payFromWallet() {
    if (!transfer?.deposit) return;
    setBusy("send");
    setError("");
    try {
      let txHash = paidTx;
      if (!txHash) {
        const contract = transfer.fromAsset.assetId.replace(/^nep141:/, "");
        txHash = await sendToken(network, contract, transfer.deposit.address, transfer.amountIn, contract === "wrap.near");
        setPaidTx(txHash);
        reloadWallet();
      }
      setTransfer((await api<{ transfer: TransferView }>(`/transfers/${transfer.id}/sent`, { body: { txHash } })).transfer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy("");
    }
  }

  async function confirm() {
    if (!transfer?.intentToSign) return;
    setBusy("send");
    setError("");
    try {
      const signed = await signTransfer(network, transfer.intentToSign, accountId);
      setTransfer((await api<{ transfer: TransferView }>(`/transfers/${transfer.id}/sign`, { body: signed })).transfer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't go through.");
    } finally {
      setBusy("");
    }
  }

  async function back() {
    // Once the wallet has paid, the transfer stays open: Scrim keeps following it to the end.
    if (transfer?.status === "awaiting_signature" || (transfer?.fromWallet && transfer.status === "awaiting_deposit" && !paidTx)) await api(`/transfers/${transfer.id}/cancel`, { method: "POST" }).catch(() => {});
    setTransfer(null);
    setPaidTx("");
    setError("");
  }

  const titles: Record<Mode, [string, string, string]> = fromWallet ? {
    swap: ["Swap", "Trade one coin for another", "Swap coins in your NEAR wallet. The new coins come back to your wallet."],
    person: ["Send", "Pay someone", "Send from your NEAR wallet to any NEAR account, like any wallet transfer."],
    address: ["Send", "Pay out to any address", "Send from your NEAR wallet to a wallet or exchange on any chain."],
  } : {
    swap: ["Swap", "Trade one coin for another", "Swap inside your private balance. Nobody sees what you traded."],
    person: ["Send", "Pay someone", "From your private balance, money moves between private balances and the public sees nothing."],
    address: ["Send", "Pay out to any address", "Send to a wallet or exchange on any chain. From your private balance, the payment can't be traced back to you."],
  };

  const enough = transfer && held ? BigInt(held.amount) >= BigInt(transfer.amountIn) : null;
  const fee = transfer && from?.priceUsd != null && to?.priceUsd != null ? Math.max(0, Number(transfer.amountIn) / 10 ** transfer.fromAsset.decimals * from.priceUsd - Number(transfer.amountOut) / 10 ** transfer.toAsset.decimals * to.priceUsd) : null;

  return (
    <div className="narrow">
      <Heading eyebrow={titles[mode][0]} title={titles[mode][1]} text={titles[mode][2]} />
      {!transfer && (
        <div className="tabs" role="tablist">
          {([["person", "To a person"], ["address", "To any address"], ["swap", "Swap"]] as const).map(([id, label]) => (
            <button key={id} role="tab" className="tab" aria-selected={mode === id} onClick={() => { setMode(id); setError(""); }}>{label}</button>
          ))}
        </div>
      )}

      {!transfer && network === "mainnet" && (
        <div className="field">
          <span className="picker-label">Pay from</span>
          <div className="segmented" role="radiogroup" aria-label="Pay from">
            <button type="button" role="radio" aria-checked={!fromWallet} onClick={() => setSource("private")}>Private balance</button>
            <button type="button" role="radio" aria-checked={fromWallet} onClick={() => setSource("wallet")}>My wallet</button>
          </div>
          <small className="muted">{fromWallet ? "Paid from your NEAR wallet, like any transfer: it shows on the blockchain." : "Paid from your private balance: nobody can see what you hold or who you pay."}</small>
        </div>
      )}

      {!fromWallet && priv && priv.status !== "active" && <div className="notice">Unlock your private balance on the <Link href="/app">home screen</Link> first.</div>}
      {fromWallet && pub && holdings.length === 0 && <div className="notice">Your wallet holds no coins on NEAR yet.</div>}
      {!fromWallet && priv?.status === "active" && holdings.length === 0 && <div className="notice">Your private balance is empty. <Link href="/app/add">Add money</Link> to get started.</div>}

      {!transfer ? (
        <form className="card card-pad form-grid" onSubmit={(e) => { e.preventDefault(); getPrice(); }}>
          <AssetPicker label={mode === "swap" ? "You pay with" : mode === "address" ? (fromWallet ? "Take from your wallet" : "Take from your balance") : "Coin to send"} assets={fromAssets} value={fromId} onChange={setFromId}
            hint={held ? `You hold ${held.display} ${held.symbol}` : undefined} empty={ready && holdings.length === 0 ? "No coins yet" : undefined} />
          {mode === "swap" && <AssetPicker label="You get" assets={assets.filter((a) => a.assetId !== fromId && (!fromWallet || a.chain === "near"))} value={toId} onChange={setToId} />}
          {mode === "person" && (
            <label className="field">Send to<small>Their NEAR account, ending in .near</small>
              <input className="input" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="account.near" autoComplete="off" spellCheck={false} required /></label>
          )}
          {mode === "address" && (
            <>
              <AssetPicker label="They receive" assets={assets} value={toId} onChange={setToId} hint="Any coin on any network. Scrim converts for you." />
              <label className="field">Their address on {to?.chainName ?? "that network"}
                {to?.chain === "zec" && <small>A shielded address (starting u1 or zs1) works too. It keeps the receiving side private on Zcash.</small>}
                <input className="input mono" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="Paste the address" autoComplete="off" spellCheck={false} required /></label>
            </>
          )}
          <label className="field">{mode === "swap" ? "Amount to swap" : mode === "address" ? "Amount they receive" : "Amount"}
            <span className="input-affix"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
              <span>{(mode === "swap" ? from : mode === "address" ? to : from)?.symbol}</span></span>
            {mode === "swap" && held && <button type="button" className="linklike" onClick={() => setAmount(held.display.replace(/,/g, ""))}>Use everything I hold ({held.display})</button>}
          </label>
          {mode !== "swap" && <label className="field">Note <small>Optional. Only you can see it.</small><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="What it is for" /></label>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {sentHash && <div className="notice good">Sent from your wallet. <span className="muted mono">Receipt {sentHash.slice(0, 10)}…</span> <Link href="/app/activity">Activity</Link></div>}
          <button className="btn btn-primary btn-lg" disabled={busy !== "" || !ready}>{busy === "price" && <Spinner />} {fromWallet && mode === "person" ? "Send with my wallet" : "See the price"}</button>
        </form>
      ) : (
        <div className="card card-pad form-grid">
          <div className="between"><h2>{transfer.status === "awaiting_signature" ? "Check and confirm" : "Your transfer"}</h2><StateChip status={transfer.status} /></div>
          <dl className="detail-list">
            <div><dt>You pay</dt><dd>{fmt(transfer.amountIn, transfer.fromAsset.decimals)} {transfer.fromAsset.symbol} <span className="muted">· {transfer.fromAsset.chainName}</span></dd></div>
            <div><dt>{transfer.kind === "swap" ? "You get" : "They get"}</dt><dd>{fmt(transfer.amountOut, transfer.toAsset.decimals)} {transfer.toAsset.symbol} <span className="muted">· {transfer.toAsset.chainName}</span></dd></div>
            {transfer.recipient && <div><dt>To</dt><dd className="mono">{transfer.recipient}</dd></div>}
            {fee !== null && <div><dt>Fee</dt><dd>{usd(fee)}</dd></div>}
            {transfer.etaSeconds != null && <div><dt>Arrives in</dt><dd>about {transfer.etaSeconds} seconds</dd></div>}
            {transfer.note && <div><dt>Note</dt><dd>{transfer.note}</dd></div>}
          </dl>
          {transfer.status === "awaiting_signature" && (
            <>
              {enough === false && <div className="notice danger">You don't hold enough for this. Lower the amount or <Link href="/app/add">add money</Link>.</div>}
              <p className="muted small-print">Your wallet will ask you to approve this exact transfer. This price is held for a few minutes.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="between">
                <button className="btn btn-ghost" onClick={back} disabled={busy !== ""}>Back</button>
                <button className="btn btn-signal btn-lg" onClick={confirm} disabled={busy !== "" || enough === false}>{busy === "send" && <Spinner />} Confirm with my wallet</button>
              </div>
            </>
          )}
          {transfer.fromWallet && transfer.status === "awaiting_deposit" && transfer.deposit && (
            <>
              {enough === false && <div className="notice danger">Your wallet doesn't hold enough for this. Lower the amount.</div>}
              <p className="muted small-print">Your wallet will send {fmt(transfer.amountIn, transfer.fromAsset.decimals)} {transfer.fromAsset.symbol} to a one-time NEAR Intents address, which delivers the result. This price is held for a few minutes.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="between">
                <button className="btn btn-ghost" onClick={back} disabled={busy !== ""}>Back</button>
                <button className="btn btn-signal btn-lg" onClick={payFromWallet} disabled={busy !== "" || (enough === false && !paidTx)}>{busy === "send" && <Spinner />} {paidTx ? "Check payment" : "Pay with my wallet"}</button>
              </div>
            </>
          )}
          {transfer.status === "processing" && <div className="notice info"><Spinner /> On its way. You can leave this page; it will show up in your activity.</div>}
          {transfer.status === "success" && <div className="notice good">Done. {transfer.kind === "swap" ? transfer.fromWallet ? `Your new coins are in your wallet${transfer.toAsset.symbol === "wNEAR" ? " as wrapped NEAR" : ""}.` : "Your new coins are in your private balance." : "The money has arrived."}
            {transfer.resultHashes[0] && <> <span className="muted mono">Receipt {transfer.resultHashes[0].slice(0, 10)}…</span></>}</div>}
          {["failed", "refunded", "expired"].includes(transfer.status) && <div className="notice danger">{transfer.status === "refunded" ? `This couldn't be completed, and your money was returned to your ${transfer.fromWallet ? "wallet" : "balance"}.` : `This didn't go through. Nothing was taken from your ${transfer.fromWallet ? "wallet" : "balance"}.`}</div>}
          {TERMINAL.has(transfer.status) && <div className="between"><Link href="/app" className="btn btn-ghost">Home</Link><button className="btn btn-primary" onClick={() => { setTransfer(null); setPaidTx(""); setAmount(""); toast("Ready for another"); }}>Do another</button></div>}
        </div>
      )}
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { registerWithToken, sendNear, sendToken, signTransfer, unwrapNear, wrapNear } from "@/client/wallet";
import { formatBalance, parseAmount } from "@/protocol/amount";
import { AssetPicker, fmt, trimDecimals, Heading, isLate, StateChip, usd, useAssets, type AssetInfo, type Balances, type TransferView } from "./money";
import { useSession } from "./session";
import { Spinner, useToast } from "./ui";
import { StatusMark } from "./StatusMark";
import { useT } from "@/i18n/I18n";

type Mode = "swap" | "person" | "address";
type Holding = { assetId: string; symbol: string; chainName: string; amount: string; display: string; usd?: number | null };
type Source = "private" | "wallet";
type WalletHolding = { id: string; symbol: string; decimals: number; amount: string; display: string; usd?: number | null };
// The wallet's own NEAR, listed apart from wNEAR. NEAR Intents takes it as wNEAR, wrapped when it pays.
const NATIVE = "native:near";
const WNEAR = "nep141:wrap.near";
const walletAssetId = (id: string) => (id === "near" ? NATIVE : `nep141:${id}`);
const intentsId = (id: string) => (id === NATIVE ? WNEAR : id);
// NEAR kept back for network fees and token registration when paying with the wallet's own NEAR.
const NEAR_RESERVE = 2n * 10n ** 22n; // 0.02 NEAR: token registration (0.00125) plus 50 Tgas held while a payment runs (0.005 at 100M yocto per gas), with room to spare
const spendable = (h: WalletHolding) => (h.id === "near" ? (BigInt(h.amount) > NEAR_RESERVE ? BigInt(h.amount) - NEAR_RESERVE : 0n) : BigInt(h.amount));
const TERMINAL = new Set(["success", "refunded", "failed", "expired", "cancelled"]);

export function SendSwap({ initial }: { initial: Mode }) {
  const t = useT();
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
    ? (pub?.holdings ?? []).filter((h) => BigInt(h.amount) > 0n || h.id === "near").map((h) => ({ assetId: walletAssetId(h.id), symbol: h.symbol, chainName: "NEAR", amount: spendable(h).toString(), display: h.id === "near" ? formatBalance(spendable(h), h.decimals) : h.display, usd: h.usd ?? null }))
    : priv?.holdings ?? [], [fromWallet, pub, priv]);
  const ready = fromWallet ? Boolean(pub) : priv?.status === "active";
  // In the wallet, NEAR and wNEAR are two coins: NEAR is a copy of wNEAR's listing under its own ID.
  const allAssets = useMemo(() => {
    const w = assets.find((a) => a.assetId === WNEAR);
    return fromWallet && w ? [{ ...w, assetId: NATIVE, symbol: "NEAR" }, ...assets] : assets;
  }, [assets, fromWallet]);
  const balances: Balances = useMemo(() => Object.fromEntries(holdings.map((h) => [h.assetId, { display: h.display, usd: h.usd ?? null }])), [holdings]);
  const fromAssets = useMemo(() => allAssets.filter((a) => holdings.some((h) => h.assetId === a.assetId)), [allAssets, holdings]);
  const from = allAssets.find((a) => a.assetId === fromId);
  const to = allAssets.find((a) => a.assetId === (mode === "swap" || mode === "address" ? toId : fromId));
  const held = holdings.find((h) => h.assetId === fromId);

  useEffect(() => {
    if (!fromId && holdings.length && fromAssets.length) setFromId([...holdings].sort((x, y) => (y.usd ?? 0) - (x.usd ?? 0)).find((h) => fromAssets.some((a) => a.assetId === h.assetId))?.assetId ?? fromAssets[0].assetId); // the coin worth the most
  }, [fromId, fromAssets, holdings]);
  useEffect(() => { setFromId(""); setToId(""); setSentHash(""); }, [source]);

  useEffect(() => {
    if (!transfer || TERMINAL.has(transfer.status) || transfer.status === "awaiting_signature") return;
    const timer = setInterval(async () => {
      try { setTransfer((await api<{ transfer: TransferView }>(`/transfers/${transfer.id}`)).transfer); } catch { /* keep last state */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [transfer]);

  // A public payment of the same coin to a NEAR account is a plain transfer from the wallet: no swap, no deposit address.
  const nearAccount = /^([a-z0-9]+[-_.])*[a-z0-9]+$/.test(recipient.trim().toLowerCase()) && (/\.(near|tg)$/.test(recipient.trim().toLowerCase()) || /^[0-9a-f]{64}$/.test(recipient.trim().toLowerCase()));
  const direct = fromWallet && (mode === "person" || (mode === "address" && toId === fromId && to?.chain === "near" && nearAccount));
  // NEAR to wNEAR or back in the wallet: the wNEAR contract changes it one to one.
  const wrapping = fromWallet && mode === "swap" && ((fromId === NATIVE && toId === WNEAR) || (fromId === WNEAR && toId === NATIVE));
  const kind = mode === "swap" ? "swap" : mode === "person" ? "send" : "withdraw";

  async function getPrice() {
    setBusy("price");
    setError("");
    try {
      if (direct) return await sendDirect();
      if (wrapping) return await wrapOrUnwrap();
      const body = { kind, fromAssetId: intentsId(fromId), toAssetId: intentsId(mode === "person" ? fromId : toId), amount, recipient, note, privacy: fromWallet ? "public" : "private" };
      setTransfer((await api<{ transfer: TransferView }>("/transfers", { body })).transfer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a price.");
    } finally {
      setBusy("");
    }
  }

  // From the wallet to a NEAR account: an ordinary transfer the wallet signs. Nothing goes through Scrim.
  async function sendDirect() {
    const coin = (pub?.holdings ?? []).find((h) => walletAssetId(h.id) === fromId);
    if (!coin) throw new Error(t("Choose a coin your wallet holds."));
    const minor = parseAmount(amount, coin.decimals);
    if (minor <= 0n) throw new Error(t("Enter an amount."));
    if (minor > spendable(coin)) throw new Error(coin.id === "near" ? "Keep about 0.02 NEAR in your wallet for network fees. Lower the amount." : `Your wallet holds ${coin.display} ${coin.symbol}.`);
    // Tokens sent to an account that doesn't exist are lost, so check it first.
    const check = await api<{ accountId: string; exists: boolean }>(`/accounts/check?id=${encodeURIComponent(recipient.trim().toLowerCase())}`);
    if (!check.exists && !/^[0-9a-f]{64}$/.test(check.accountId)) throw new Error(`${check.accountId} doesn't exist. Check the spelling.`);
    if (check.accountId === accountId) throw new Error(t("That's your own account."));
    setSentHash(coin.id === "near" ? await sendNear(network, check.accountId, minor.toString()) : await sendToken(network, coin.id, check.accountId, minor.toString()));
    setAmount("");
    reloadWallet();
  }

  async function wrapOrUnwrap() {
    const coin = (pub?.holdings ?? []).find((h) => walletAssetId(h.id) === fromId);
    if (!coin) throw new Error(t("Choose a coin your wallet holds."));
    const minor = parseAmount(amount, 24);
    if (minor <= 0n) throw new Error(t("Enter an amount."));
    if (minor > spendable(coin)) throw new Error(coin.id === "near" ? "Keep about 0.02 NEAR in your wallet for network fees. Lower the amount." : `Your wallet holds ${coin.display} ${coin.symbol}.`);
    setSentHash(fromId === NATIVE ? await wrapNear(network, minor.toString()) : await unwrapNear(network, minor.toString()));
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
        // A NEAR token can only land in an account registered with it. Register the receiver first if needed
        // (for a swap, the person's own wallet), or the result can't be delivered to the wallet.
        const outContract = transfer.toAsset.assetId.replace(/^nep141:/, "");
        if (/near/i.test(transfer.toAsset.chainName) && outContract !== "wrap.near" && transfer.recipient && !transfer.recipient.startsWith("0x")) {
          const check = await api<{ registered?: boolean }>(`/accounts/check?id=${encodeURIComponent(transfer.recipient)}&token=${encodeURIComponent(outContract)}`).catch(() => null);
          if (check?.registered === false) await registerWithToken(network, outContract, transfer.recipient);
        }
        const contract = transfer.fromAsset.assetId.replace(/^nep141:/, "");
        txHash = await sendToken(network, contract, transfer.deposit.address, transfer.amountIn, fromId === NATIVE); // the wallet's own NEAR is wrapped first; wNEAR pays as it is
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
    swap: ["Swap", "Trade one coin for another", "In your NEAR wallet. The new coins come back to it."],
    person: ["Send", "Pay someone", "From your NEAR wallet to any NEAR account."],
    address: ["Send", "Pay out to any address", "From your NEAR wallet to any wallet or exchange."],
  } : {
    swap: ["Swap", "Trade one coin for another", "Inside your private balance. Nobody sees what you traded."],
    person: ["Send", "Pay someone", "From your private balance. The public sees nothing."],
    address: ["Send", "Pay out to any address", "To any wallet or exchange, on any chain. It can't be traced back to you."],
  };

  const amtAsset = mode === "address" ? to : from;
  const amtNum = Number(amount.replace(/,/g, ""));
  const amountUsd = amtAsset?.priceUsd != null && amtNum > 0 ? amtNum * amtAsset.priceUsd : null;
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

      {!fromWallet && priv && priv.status !== "active" && <div className="notice">{t("Unlock your private balance on the")} <Link href="/app">{t("home screen")}</Link> first.</div>}
      {fromWallet && pub && holdings.length === 0 && <div className="notice">{t("Your wallet holds no coins on NEAR yet.")}</div>}
      {!fromWallet && priv?.status === "active" && holdings.length === 0 && <div className="notice">{t("Your private balance is empty.")} <Link href="/app/add">{t("Add money")}</Link> to get started.</div>}

      {!transfer ? (
        <form className="trade" onSubmit={(e) => { e.preventDefault(); getPrice(); }}>
          {network === "mainnet" && (
            <div className="trade-src" role="radiogroup" aria-label={t("Pay from")}>
              <button type="button" role="radio" aria-checked={!fromWallet} onClick={() => setSource("private")}>{t("Private")}</button>
              <button type="button" role="radio" aria-checked={fromWallet} onClick={() => setSource("wallet")}>{t("Public (my wallet)")}</button>
            </div>
          )}
          {network === "mainnet" && <p className="trade-note">{fromWallet ? t("Public. They receive it in their wallet, and anyone can see the payment on the blockchain.") : t("Private. Nobody can see the amount or who you pay.")}</p>}
          <div className="tp">
            <div className="tp-top">
              <span>{mode === "swap" ? t("You pay") : mode === "address" ? t("They receive") : t("Amount")}</span>
              {(mode !== "address" || (fromWallet && toId === fromId && to?.chain === "near")) && held && <button type="button" className="tp-max" onClick={() => setAmount(held.display.replace(/,/g, ""))}>{t("Balance")} {held.display} · <b>{t("Max")}</b></button>}
            </div>
            <div className="tp-main">
              <input className="tp-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" aria-label={t("Amount")} required />
              {mode === "address"
                ? <AssetPicker pill balances={balances} label={t("They receive")} assets={allAssets} value={toId} onChange={setToId} />
                : <AssetPicker pill balances={balances} label={t("Coin to send")} assets={fromAssets} value={fromId} onChange={setFromId} empty={ready && holdings.length === 0 ? "No coins yet" : undefined} />}
            </div>
            <div className="tp-sub">{amountUsd !== null ? `≈ ${usd(amountUsd)}` : "\u00a0"}</div>
          </div>
          {mode === "swap" && (
            <>
              <button type="button" className="tp-flip" aria-label={t("Switch coins")} disabled={!fromAssets.some((a) => a.assetId === toId)} onClick={() => { setFromId(toId); setToId(fromId); }}>⇅</button>
              <div className="tp">
                <div className="tp-top"><span>{t("You get")}</span></div>
                <div className="tp-main">
                  <span className="tp-amount quiet">—</span>
                  <AssetPicker pill balances={balances} label={t("You get")} assets={allAssets.filter((a) => a.assetId !== fromId && (!fromWallet || a.chain === "near"))} value={toId} onChange={setToId} />
                </div>
                <div className="tp-sub">{t("You see the price on the next step.")}</div>
              </div>
            </>
          )}
          {mode === "person" && (
            <div className="tp">
              <div className="tp-top"><span>{t("Send to")}</span></div>
              <input className="tp-text" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="account.near" autoComplete="off" spellCheck={false} aria-label={t("Send to")} required />
            </div>
          )}
          {mode === "address" && (
            <div className="tp">
              <div className="tp-top"><span>{t("Their address")}</span></div>
              <input className="tp-text mono" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={`${t("Address on")} ${to?.chainName ?? "…"}`} autoComplete="off" spellCheck={false} aria-label={t("Their address")} required />
              {to?.chain === "zec" && <div className="tp-sub">{t("A shielded address (starting u1 or zs1) works too. It keeps the receiving side private on Zcash.")}</div>}
              <div className="tp-paywith">
                <span>{fromWallet ? t("From your wallet") : t("From your balance")}{held ? ` · ${t("Balance")} ${held.display}` : ""}</span>
                <AssetPicker pill balances={balances} label={t("Coin to send")} assets={fromAssets} value={fromId} onChange={setFromId} empty={ready && holdings.length === 0 ? "No coins yet" : undefined} />
              </div>
            </div>
          )}
          {mode !== "swap" && <input className="tp-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={`${t("Note")} (${t("optional, only you can see it")})`} aria-label={t("Note")} />}
          {error && <p className="form-error" role="alert">{error}</p>}
          {sentHash && <div className="notice good">{t("Sent from your wallet.")} <span className="muted mono">Receipt {sentHash.slice(0, 10)}…</span> <Link href="/app/activity">{t("Activity")}</Link></div>}
          <button className="btn btn-primary btn-lg trade-go" disabled={busy !== "" || !ready}>{busy === "price" && <Spinner />} {wrapping ? (fromId === NATIVE ? t("Wrap with my wallet") : t("Unwrap with my wallet")) : direct ? t("Send with my wallet") : t("See the price")}</button>
          {fromWallet && <p className="trade-note">{t("Your wallet opens in a new tab. After you approve, come back to this tab.")}</p>}
        </form>
      ) : (
        <div className="card card-pad form-grid">
          <div className="between"><h2>{transfer.status === "awaiting_signature" ? "Check and confirm" : "Your transfer"}</h2><StateChip status={transfer.status} /></div>
          <dl className="detail-list">
            <div><dt>{t("You pay")}</dt><dd>{trimDecimals(fmt(transfer.amountIn, transfer.fromAsset.decimals))} {transfer.fromAsset.symbol} <span className="muted">· {transfer.fromAsset.chainName}</span></dd></div>
            <div><dt>{transfer.kind === "swap" ? "You get" : "They get"}</dt><dd>{fmt(transfer.amountOut, transfer.toAsset.decimals)} {transfer.toAsset.symbol} <span className="muted">· {transfer.toAsset.chainName}</span></dd></div>
            {transfer.minAmountOut && transfer.minAmountOut !== transfer.amountOut && ["awaiting_signature", "awaiting_deposit"].includes(transfer.status) ? <div><dt>{t("At least")}</dt><dd>{fmt(transfer.minAmountOut!, transfer.toAsset.decimals)} {transfer.toAsset.symbol} <span className="muted">· {t("if the price moves")}</span></dd></div> : null}
            {transfer.recipient && <div><dt>{t("To")}</dt><dd className="mono">{transfer.recipient}</dd></div>}
            {fee !== null && <div><dt>{t("Fee")}</dt><dd>{usd(fee)}</dd></div>}
            {transfer.etaSeconds != null && <div><dt>{t("Arrives in")}</dt><dd>about {transfer.etaSeconds} seconds</dd></div>}
            {transfer.note && <div><dt>{t("Note")}</dt><dd>{transfer.note}</dd></div>}
          </dl>
          {transfer.status === "awaiting_signature" && (
            <>
              {enough === false && <div className="notice danger">{t("You don't hold enough for this. Lower the amount or")} <Link href="/app/add">{t("add money")}</Link>.</div>}
              <p className="muted small-print">{t("Your wallet will ask you to approve this exact transfer. This price is held for a few minutes.")}</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="between">
                <button className="btn btn-ghost" onClick={back} disabled={busy !== ""}>{t("Back")}</button>
                <button className="btn btn-signal btn-lg" onClick={confirm} disabled={busy !== "" || enough === false}>{busy === "send" && <Spinner />} Confirm with my wallet</button>
              </div>
            </>
          )}
          {transfer.fromWallet && transfer.status === "awaiting_deposit" && transfer.deposit && (
            <>
              {enough === false && held && <div className="notice danger">{t("Your wallet doesn't hold enough for this. Lower the amount.")} {t("It holds {amount} {coin} you can spend.", { amount: trimDecimals(held.display), coin: transfer.fromAsset.symbol === "wNEAR" ? "NEAR" : transfer.fromAsset.symbol })}</div>}
              <p className="muted small-print">Your wallet will send {trimDecimals(fmt(transfer.amountIn, transfer.fromAsset.decimals))} {transfer.fromAsset.symbol} to a one-time NEAR Intents address, which delivers the result. This price is held for a few minutes.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <div className="between">
                <button className="btn btn-ghost" onClick={back} disabled={busy !== ""}>{t("Back")}</button>
                <button className="btn btn-signal btn-lg" onClick={payFromWallet} disabled={busy !== "" || (enough === false && !paidTx)}>{busy === "send" && <Spinner />} {paidTx ? "Check payment" : "Pay with my wallet"}</button>
              </div>
            </>
          )}
          {transfer.status === "processing" && <div className="notice info status-line"><StatusMark state="moving" size={28} /><span className="text">{isLate(transfer) ? (transfer.fromWallet ? t("This is taking longer than usual. If it doesn't complete, NEAR Intents returns your coins to your wallet.") : t("This is taking longer than usual. If it doesn't complete, NEAR Intents returns your coins to your balance.")) : t("On its way. You can leave this page; it will show up in your activity.")}</span></div>}
          {transfer.status === "success" && <div className="notice good status-line"><StatusMark state="done" size={40} /><div className="text"><b>{t("Done")}</b> {transfer.kind === "swap" ? transfer.fromWallet ? `Your new coins are in your wallet${transfer.toAsset.symbol === "wNEAR" ? " as wrapped NEAR" : ""}.` : "Your new coins are in your private balance." : "The money has arrived."}
            {transfer.resultHashes[0] && <> <span className="muted mono">Receipt {transfer.resultHashes[0].slice(0, 10)}…</span></>}</div></div>}
          {["failed", "refunded", "expired"].includes(transfer.status) && <div className="notice danger">{transfer.status === "refunded" ? `This couldn't be completed, and your money was returned to your ${transfer.fromWallet ? "wallet" : "balance"}.` : `This didn't go through. Nothing was taken from your ${transfer.fromWallet ? "wallet" : "balance"}.`}</div>}
          {TERMINAL.has(transfer.status) && <div className="between"><Link href="/app" className="btn btn-ghost">{t("Home")}</Link><button className="btn btn-primary" onClick={() => { setTransfer(null); setPaidTx(""); setAmount(""); toast(t("Ready for another")); }}>Do another</button></div>}
        </div>
      )}
    </div>
  );
}

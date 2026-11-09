"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { AssetPicker, CopyField, fmt, Heading, StateChip, useAssets, type TransferView } from "./money";
import { PayFromSolanaWallet } from "./PayFromSolanaWallet";
import { PayFromWallet } from "./PayFromWallet";
import { useSession } from "./session";
import { Spinner } from "./ui";
import { useT } from "@/i18n/I18n";
import { StatusMark } from "./StatusMark";

export function AddMoney() {
  const t = useT();
  const { accountId } = useSession();
  const all = useAssets();
  // Where it lands is the person's choice: the private balance, or their own NEAR wallet in public.
  const [into, setInto] = useState<"private" | "wallet">("private");
  const toWallet = into === "wallet";
  const assets = all.filter((a) => (toWallet ? a.canAdd || a.chain === "near" : a.canAdd));
  const [assetId, setAssetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [transfer, setTransfer] = useState<TransferView | null>(null);

  useEffect(() => {
    if (!transfer || ["success", "refunded", "failed", "expired", "cancelled"].includes(transfer.status)) return;
    const timer = setInterval(async () => {
      try { setTransfer((await api<{ transfer: TransferView }>(`/transfers/${transfer.id}`)).transfer); } catch { /* keep last state */ }
    }, 5000);
    return () => clearInterval(timer);
  }, [transfer]);

  async function start() {
    setBusy(true);
    setError("");
    try {
      setTransfer((await api<{ transfer: TransferView }>("/transfers", { body: { kind: "add", fromAssetId: assetId, amount: "0", privacy: toWallet ? "public" : "private" } })).transfer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a deposit address.");
    } finally {
      setBusy(false);
    }
  }

  const picked = assets.find((a) => a.assetId === assetId);
  const direct = toWallet && picked?.chain === "near"; // a coin on NEAR goes straight to the wallet's own address
  const landsIn = transfer?.fromWallet ? "your wallet" : "your private balance";

  return (
    <div className="narrow">
      <Heading eyebrow="Add money" title={t("Bring money in from any chain")} text="Pick a coin and its network. Send to the one-time address from any wallet or exchange." />
      {!transfer ? (
        <form className="trade" onSubmit={(e) => { e.preventDefault(); if (!direct && assetId) void start(); }}>
          <div className="trade-src" role="radiogroup" aria-label={t("Where it lands")}>
            <button type="button" role="radio" aria-checked={!toWallet} onClick={() => { setInto("private"); setAssetId(""); }}>{t("Private")}</button>
            <button type="button" role="radio" aria-checked={toWallet} onClick={() => { setInto("wallet"); setAssetId(""); }}>{t("Public (my wallet)")}</button>
          </div>
          <p className="trade-note">{toWallet ? "Lands in your NEAR wallet and shows on the blockchain. If it can't be delivered, it comes back to you in Scrim." : "Lands in your private balance. Nobody can link what you add to what you send later."}</p>
          <div className="tp">
            <div className="tp-top"><span>{t("What are you sending?")}</span></div>
            <AssetPicker pill wide label={t("What are you sending?")} assets={assets} value={assetId} onChange={setAssetId} />
          </div>
          {direct ? (
            <div className="tp">
              <CopyField label={t("Your NEAR wallet address")} value={accountId} />
              <div className="tp-sub">Send {picked.symbol} on NEAR straight to this address from any wallet or exchange.</div>
            </div>
          ) : (
            <>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="btn btn-primary btn-lg trade-go" disabled={busy || !assetId}>{busy && <Spinner />} {t("Get my deposit address")}</button>
            </>
          )}
        </form>
      ) : (
        <div className="card card-pad form-grid">
          <div className="between"><h2>Send {transfer.fromAsset.symbol} on {transfer.fromAsset.chainName}</h2><StateChip status={transfer.status} /></div>
          {transfer.deposit && (
            <>
              <CopyField label={`Your deposit address on ${transfer.deposit.chainName}`} value={transfer.deposit.address} />
              {transfer.fromWallet && transfer.toAsset.symbol !== transfer.fromAsset.symbol && <div className="notice info">{t("It arrives in your wallet as {symbol}.", { symbol: transfer.toAsset.symbol === "wNEAR" ? "NEAR" : transfer.toAsset.symbol })}</div>}
              {transfer.deposit.memo && <CopyField label="Memo (required)" value={transfer.deposit.memo} />}
              <ul className="checklist">
                <li>{t("Send only")} <b>{transfer.fromAsset.symbol}</b> on the <b>{transfer.fromAsset.chainName}</b> network. Anything else can be lost.</li>
                {transfer.deposit.minimum && <li>Minimum: {fmt(transfer.deposit.minimum, transfer.fromAsset.decimals, 0)} {transfer.fromAsset.symbol}. Smaller deposits aren't credited.</li>}
                <li>{t("Use this address once. Create a new one for your next deposit.")}</li>
                <li>{t("It stays open for 24 hours.")}</li>
              </ul>
              {transfer.status === "awaiting_deposit" && transfer.deposit.evm && (
                <PayFromWallet to={transfer.deposit.address} chainId={transfer.deposit.evm.chainId} token={transfer.deposit.evm.token}
                  symbol={transfer.fromAsset.symbol} decimals={transfer.fromAsset.decimals} minimum={transfer.deposit.minimum} />
              )}
              {transfer.status === "awaiting_deposit" && transfer.deposit.solana && (
                <PayFromSolanaWallet to={transfer.deposit.address} mint={transfer.deposit.solana.mint}
                  symbol={transfer.fromAsset.symbol} decimals={transfer.fromAsset.decimals} minimum={transfer.deposit.minimum} />
              )}
            </>
          )}
          {!["refunded", "failed", "expired"].includes(transfer.status) && (() => {
            const step = transfer.status === "success" ? 3 : transfer.status === "processing" ? 2 : 1;
            const rows = [
              t("Send {symbol} to the address above", { symbol: transfer.fromAsset.symbol }),
              t("Received. Moving it now"),
              transfer.fromWallet ? t("Arrived in your wallet") : t("Arrived in your private balance"),
            ];
            return (
              <ol className="deposit-steps">
                {rows.map((label, i) => {
                  const n = i + 1;
                  const state = n < step || step === 3 ? "done" : n === step ? "now" : "next";
                  return <li key={n} className={state}>{state === "next" ? <i /> : <StatusMark state={state === "done" ? "done" : "moving"} size={22} />}<span>{label}</span></li>;
                })}
              </ol>
            );
          })()}
          {["refunded", "failed", "expired"].includes(transfer.status) && <div className="notice danger">{t("This deposit address is closed. If you sent money to it, it is returned to the address it came from.")}</div>}
          <div className="between">
            <button className="btn btn-ghost" onClick={() => setTransfer(null)}>{transfer.status === "awaiting_deposit" ? "Back" : "Add more"}</button>
            {!["success", "refunded", "failed", "expired"].includes(transfer.status) && <span className="muted small">{t("This page updates by itself.")}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

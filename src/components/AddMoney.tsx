"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { NotSwitchedOn } from "./Gates";
import { AssetPicker, CopyField, fmt, Heading, StateChip, useAssets, type TransferView } from "./money";
import { Spinner } from "./ui";

export function AddMoney() {
  const assets = useAssets().filter((a) => a.canAdd);
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
      setTransfer((await api<{ transfer: TransferView }>("/transfers", { body: { kind: "add", fromAssetId: assetId, amount: "0" } })).transfer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not get a deposit address.");
    } finally {
      setBusy(false);
    }
  }

  const picked = assets.find((a) => a.assetId === assetId);

  return (
    <div className="narrow">
      <Heading eyebrow="Add money" title="Bring money in from any chain" text="Pick a coin and its network, and Scrim gives you a one-time address. Send to it from any wallet or exchange. It lands in your private balance." />
      <NotSwitchedOn />
      {!transfer ? (
        <div className="card card-pad form-grid">
          <AssetPicker label="What are you sending?" assets={assets} value={assetId} onChange={setAssetId} />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg" onClick={start} disabled={busy || !assetId}>{busy && <Spinner />} Get my deposit address</button>
        </div>
      ) : (
        <div className="card card-pad form-grid">
          <div className="between"><h2>Send {transfer.fromAsset.symbol} on {transfer.fromAsset.chainName}</h2><StateChip status={transfer.status} /></div>
          {transfer.deposit && (
            <>
              <CopyField label={`Your deposit address on ${transfer.deposit.chainName}`} value={transfer.deposit.address} />
              {transfer.deposit.memo && <CopyField label="Memo (required)" value={transfer.deposit.memo} />}
              <ul className="checklist">
                <li>Send only <b>{transfer.fromAsset.symbol}</b> on the <b>{transfer.fromAsset.chainName}</b> network. Anything else can be lost.</li>
                {transfer.deposit.minimum && <li>Minimum: {fmt(transfer.deposit.minimum, transfer.fromAsset.decimals, 0)} {transfer.fromAsset.symbol}. Smaller deposits aren't credited.</li>}
                <li>Use this address once. Create a new one for your next deposit.</li>
                <li>It stays open for 24 hours.</li>
              </ul>
            </>
          )}
          {transfer.status === "success" && <div className="notice good">Your money arrived in your private balance.</div>}
          {transfer.status === "processing" && <div className="notice info">We see your deposit. It will be in your private balance in a moment.</div>}
          {["refunded", "failed", "expired"].includes(transfer.status) && <div className="notice danger">This deposit address is closed. If you sent money to it, it is returned to the address it came from.</div>}
          <div className="between">
            <button className="btn btn-ghost" onClick={() => setTransfer(null)}>{transfer.status === "awaiting_deposit" ? "Back" : "Add more"}</button>
            {transfer.status === "awaiting_deposit" && <span className="muted"><Spinner /> Waiting for your deposit…</span>}
          </div>
        </div>
      )}
      {picked && !transfer && <p className="muted small-print">Deposits arrive privately: nobody can link what you add here to what you send later.</p>}
    </div>
  );
}

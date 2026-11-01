"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { AssetPicker, CopyField, Heading, useAssets } from "./money";
import { ReceiveChoice, type Receive } from "./ReceiveChoice";
import { Spinner, useToast } from "./ui";
import { useT } from "@/i18n/I18n";

type Link = { code: string; symbol: string; chainName: string; display: string; note: string; status: string; receive: Receive; expiresAt: string };

export function Requests() {
  const t = useT();
  const toast = useToast();
  const assets = useAssets();
  const { data, reload } = useApi<{ links: Link[] }>("/links", { every: 20_000 });
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [receive, setReceive] = useState<Receive>("private");
  const onNear = assets.find((a) => a.assetId === assetId)?.chain === "near";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Link | null>(null);
  const url = (code: string) => `${window.location.origin}/pay/${code}`;
  const agentUrl = (code: string) => `${window.location.origin}/api/x402/pay/${code}`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { link } = await api<{ link: Link }>("/links", { body: { assetId, amount, note, days, receive: onNear ? receive : "private" } });
      setFresh(link);
      setAmount("");
      setNote("");
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <Heading eyebrow="Get paid" title={t("Ask for money with a link")} text="Share a link. Whoever opens it can pay from any chain, with no account. You choose where the money lands: your private balance or your wallet." />
      {fresh ? (
        <div className="card card-pad form-grid">
          <h2>{t("Your link is ready")}</h2>
          <p className="muted">{t("Asking for")} <b>{fresh.display} {fresh.symbol}</b> on {fresh.chainName}{fresh.note ? ` · ${fresh.note}` : ""}</p>
          <CopyField label={t("Share this link")} value={url(fresh.code)} />
          <CopyField label="For AI agents (x402)" value={agentUrl(fresh.code)} />
          <small className="muted">{t("AI agents and apps that pay over x402 can pay this address directly, in USDC or USDT from Base, Ethereum, Solana and other chains. It lands where you chose, like any other payment to this link.")}</small>
          <div className="between">
            <button className="btn btn-ghost" onClick={() => setFresh(null)}>Make another</button>
            {typeof navigator !== "undefined" && "share" in navigator && <button className="btn btn-primary" onClick={() => navigator.share({ title: "Payment request", url: url(fresh.code) }).catch(() => {})}>Share</button>}
          </div>
        </div>
      ) : (
        <form className="card card-pad form-grid" onSubmit={create}>
          <AssetPicker label={t("You want to receive")} assets={assets} value={assetId} onChange={setAssetId} />
          <ReceiveChoice value={onNear ? receive : "private"} onChange={setReceive} onNear={onNear} />
          <div className="form-row">
            <label className="field">{t("Amount")}<input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required /></label>
            <label className="field">{t("Link stays open for")}
              <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>{t("1 day")}</option><option value={7}>{t("7 days")}</option><option value={30}>{t("30 days")}</option></select></label>
          </div>
          <label className="field">{t("What is it for?")} <small>{t("The payer sees this.")}</small><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder={t("What it is for")} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg" disabled={busy || !assetId}>{busy && <Spinner />} Create link</button>
        </form>
      )}

      {data && data.links.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-title"><h3>{t("Your links")}</h3></div>
          <ul className="rows">
            {data.links.map((l) => (
              <li key={l.code}>
                <span className="coin dark">↓</span>
                <span><b>{l.display} {l.symbol}</b><small>{l.note || "No note"} · {l.status === "open" ? `open until ${new Date(l.expiresAt).toLocaleDateString()}` : l.status}</small></span>
                <span className="right" style={{ display: "flex", gap: 6 }}>
                  {l.status === "open" && <>
                    <button className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(url(l.code)); toast(t("Link copied")); }}>Copy</button>
                    <button className="btn btn-ghost btn-sm" title="Address AI agents can pay with x402" onClick={async () => { await navigator.clipboard.writeText(agentUrl(l.code)); toast(t("Agent address copied")); }}>Agent</button>
                    <button className="btn btn-danger btn-sm" onClick={async () => { await api(`/links/${l.code}/close`, { method: "POST" }); reload(); }}>Close</button>
                  </>}
                  {l.status === "paid" && <span className="pill pill-green">{t("Paid")}</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

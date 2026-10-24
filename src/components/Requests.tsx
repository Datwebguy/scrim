"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { AssetPicker, CopyField, Heading, useAssets } from "./money";
import { Spinner, useToast } from "./ui";

type Link = { code: string; symbol: string; chainName: string; display: string; note: string; status: string; expiresAt: string };

export function Requests() {
  const toast = useToast();
  const assets = useAssets();
  const { data, reload } = useApi<{ links: Link[] }>("/links", { every: 20_000 });
  const [assetId, setAssetId] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Link | null>(null);
  const url = (code: string) => `${window.location.origin}/pay/${code}`;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { link } = await api<{ link: Link }>("/links", { body: { assetId, amount, note, days } });
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
      <Heading eyebrow="Get paid" title="Ask for money with a link" text="Share a link. Whoever opens it can pay from any chain, with no account. The money goes straight into your private balance." />
      {fresh ? (
        <div className="card card-pad form-grid">
          <h2>Your link is ready</h2>
          <p className="muted">Asking for <b>{fresh.display} {fresh.symbol}</b> on {fresh.chainName}{fresh.note ? ` · ${fresh.note}` : ""}</p>
          <CopyField label="Share this link" value={url(fresh.code)} />
          <div className="between">
            <button className="btn btn-ghost" onClick={() => setFresh(null)}>Make another</button>
            {typeof navigator !== "undefined" && "share" in navigator && <button className="btn btn-primary" onClick={() => navigator.share({ title: "Payment request", url: url(fresh.code) }).catch(() => {})}>Share</button>}
          </div>
        </div>
      ) : (
        <form className="card card-pad form-grid" onSubmit={create}>
          <AssetPicker label="You want to receive" assets={assets} value={assetId} onChange={setAssetId} />
          <div className="form-row">
            <label className="field">Amount<input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required /></label>
            <label className="field">Link stays open for
              <select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
          </div>
          <label className="field">What is it for? <small>The payer sees this.</small><input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="What it is for" /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg" disabled={busy || !assetId}>{busy && <Spinner />} Create link</button>
        </form>
      )}

      {data && data.links.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-title"><h3>Your links</h3></div>
          <ul className="rows">
            {data.links.map((l) => (
              <li key={l.code}>
                <span className="coin dark">↓</span>
                <span><b>{l.display} {l.symbol}</b><small>{l.note || "No note"} · {l.status === "open" ? `open until ${new Date(l.expiresAt).toLocaleDateString()}` : l.status}</small></span>
                <span className="right" style={{ display: "flex", gap: 6 }}>
                  {l.status === "open" && <>
                    <button className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(url(l.code)); toast("Link copied"); }}>Copy</button>
                    <button className="btn btn-danger btn-sm" onClick={async () => { await api(`/links/${l.code}/close`, { method: "POST" }); reload(); }}>Close</button>
                  </>}
                  {l.status === "paid" && <span className="pill pill-green">Paid</span>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

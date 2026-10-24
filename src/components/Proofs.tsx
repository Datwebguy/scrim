"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { describeClaim, type ProofClaim } from "@/protocol/proof";
import { AssetPicker, CopyField, fmt, Heading, KIND_LABEL, useAssets, type TransferView } from "./money";
import { Spinner, useToast } from "./ui";

type Proof = { id: string; kind: string; reader: string; summary: ProofClaim; issuedAt: string; expiresAt: string; revoked: boolean; token: string };
type Kind = "usd" | "asset" | "payment";

export function Proofs() {
  const toast = useToast();
  const assets = useAssets();
  const { data, reload } = useApi<{ proofs: Proof[] }>("/proofs");
  const { data: tx } = useApi<{ transfers: TransferView[] }>("/transfers");
  const [kind, setKind] = useState<Kind>("usd");
  const [amount, setAmount] = useState("10000");
  const [assetId, setAssetId] = useState("");
  const [transferId, setTransferId] = useState("");
  const [exact, setExact] = useState(false);
  const [reader, setReader] = useState("");
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<Proof | null>(null);
  const link = (p: Proof) => `${window.location.origin}/verify#${p.token}`;
  const sent = (tx?.transfers ?? []).filter((t) => ["send", "withdraw"].includes(t.kind) && t.status === "success");

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const body = kind === "payment" ? { kind: "payment", transferId, reader, days, revealExact: exact } : { kind: "balance_at_least", unit: kind, assetId, amount, reader, days };
      setFresh((await api<{ proof: Proof }>("/proofs", { body })).proof);
      reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the proof.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <Heading eyebrow="Proofs" title="Show one fact, nothing else" text="Prove you hold enough, or that a payment was made, to one person you name. It expires, and you can take it back any time. They see the fact and nothing about the rest of your money." />
      {fresh ? (
        <div className="card card-pad form-grid">
          <h2>Your proof is ready</h2>
          <p className="muted">For <b>{fresh.reader}</b> · it says you <b>{describeClaim(fresh.summary)}</b> · valid until {new Date(fresh.expiresAt).toLocaleDateString()}</p>
          <CopyField label="Send them this link" value={link(fresh)} />
          <p className="muted small-print">They open the link and see a pass or fail check. They don't need an account.</p>
          <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setFresh(null)}>Make another</button>
        </div>
      ) : (
        <form className="card card-pad form-grid" onSubmit={create}>
          <div className="segmented" role="radiogroup" aria-label="What to prove">
            {([["usd", "Funds in dollars", "I hold at least…"], ["asset", "Funds in one coin", "I hold at least…"], ["payment", "A payment I sent", "I paid someone"]] as const).map(([id, title, sub]) => (
              <label key={id}><input type="radio" name="kind" checked={kind === id} onChange={() => setKind(id)} /><b>{title}</b><span>{sub}</span></label>
            ))}
          </div>
          {kind === "usd" && (
            <div className="field">Amount in dollars
              <div className="chips">{["1000", "10000", "50000"].map((v) => <button type="button" key={v} className={`chip ${amount === v ? "on" : ""}`} onClick={() => setAmount(v)}>${Number(v).toLocaleString()}</button>)}</div>
              <span className="input-affix"><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /><span>USD</span></span></div>
          )}
          {kind === "asset" && (
            <>
              <AssetPicker label="Which coin?" assets={assets} value={assetId} onChange={setAssetId} />
              <label className="field">At least<input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} required /></label>
            </>
          )}
          {kind === "payment" && (
            <>
              <label className="field">Which payment?
                <select className="select" value={transferId} onChange={(e) => setTransferId(e.target.value)} required>
                  <option value="">Choose a payment you sent</option>
                  {sent.map((t) => <option key={t.id} value={t.id}>{KIND_LABEL[t.kind]} · {fmt(t.amountOut, t.toAsset.decimals)} {t.toAsset.symbol} · {new Date(t.createdAt).toLocaleDateString()}</option>)}
                </select></label>
              <label className="checkline"><input type="checkbox" checked={exact} onChange={(e) => setExact(e.target.checked)} /> Show the exact amount (otherwise they only see "at least")</label>
            </>
          )}
          <label className="field">Who is this for?<small>Their name or company. It's written into the proof, so it only makes sense for them.</small>
            <input className="input" value={reader} onChange={(e) => setReader(e.target.value)} placeholder="A bank, landlord or client" maxLength={80} required /></label>
          <label className="field">Valid for<select className="select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn-primary btn-lg" disabled={busy}>{busy && <Spinner />} Create proof</button>
          <p className="muted small-print">Scrim checks your private balance and signs the statement. Today that check happens on Scrim's side. Proving it on your own device is the next step.</p>
        </form>
      )}

      {data && data.proofs.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-title"><h3>Proofs you've made</h3></div>
          <ul className="rows">
            {data.proofs.map((p) => {
              const expired = new Date(p.expiresAt) < new Date();
              return (
                <li key={p.id}>
                  <span className="coin dark">◇</span>
                  <span><b>For {p.reader}</b><small>{describeClaim(p.summary)}</small></span>
                  <span className="right" style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {p.revoked ? <span className="pill">Taken back</span> : expired ? <span className="pill">Expired</span> : <>
                      <button className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(link(p)); toast("Link copied"); }}>Copy link</button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { await api(`/proofs/${p.id}/revoke`, { method: "POST" }); reload(); }}>Take back</button>
                    </>}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

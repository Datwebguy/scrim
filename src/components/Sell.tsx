"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { AssetPicker, CopyField, Heading, StateChip, useAssets } from "./money";
import { ReceiveChoice, type Receive } from "./ReceiveChoice";
import { Spinner, useToast } from "./ui";
import { useT } from "@/i18n/I18n";

type Product = { code: string; name: string; description: string; symbol: string; chainName: string; display: string; delivers: "text" | "api"; receive: Receive; open: boolean; sales: number; earned: string };
type Sale = { at: string; status: string; paidWith: string; received: string };

// Sell anything over x402: agents and people pay from any coin on any chain, it lands where the seller chose,
// and the buyer gets what you sell once the payment is confirmed.
export function Sell() {
  const t = useT();
  const toast = useToast();
  const assets = useAssets();
  const { data, reload } = useApi<{ products: Product[] }>("/products", { every: 20_000 });
  const [form, setForm] = useState({ name: "", description: "", amount: "", kind: "text" as "text" | "api", text: "", url: "", headerName: "", headerValue: "" });
  const [assetId, setAssetId] = useState("");
  const [receive, setReceive] = useState<Receive>("private");
  const onNear = assets.find((a) => a.assetId === assetId)?.chain === "near";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [openCode, setOpenCode] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm({ ...form, [k]: e.target.value });
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const deliver = form.kind === "text" ? { kind: "text", text: form.text } : { kind: "api", url: form.url, header: form.headerName ? { name: form.headerName, value: form.headerValue } : undefined };
      const { product } = await api<{ product: Product }>("/products", { body: { name: form.name, description: form.description, assetId, amount: form.amount, deliver, receive: onNear ? receive : "private" } });
      setForm({ ...form, name: "", description: "", amount: "", text: "", url: "", headerName: "", headerValue: "" });
      setOpenCode(product.code);
      reload();
      toast(t("You're selling it. Share its addresses below."));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function stop(code: string) {
    if (!confirm("Stop selling this? Sales so far stay in your records.")) return;
    try {
      await api(`/products/${code}`, { method: "DELETE" });
      reload();
    } catch (err) {
      toast((err as Error).message, "error");
    }
  }

  const products = data?.products ?? [];
  return (
    <div className="narrow wide">
      <Heading eyebrow="Sell" title={t("Sell to agents and people")} text="Sell a file, a code, a report or your API. Agents pay over x402, people on a pay page, from any coin on any chain. Each sale lands where you choose, your private balance or your wallet, and buyers get what you sell once the payment is confirmed." />

      {products.length > 0 && (
        <div className="form-grid" style={{ marginBottom: 20 }}>
          {products.map((p) => (
            <div key={p.code} className="card card-pad form-grid">
              <div className="between">
                <div>
                  <h3 style={{ margin: 0 }}>{p.name}</h3>
                  <small className="muted">{p.display} {p.symbol} · delivers {p.delivers === "text" ? "a text or link" : "your API's answer"} · lands in your {p.receive === "wallet" ? "wallet" : "private balance"}{p.open ? "" : " · stopped"}</small>
                </div>
                <div style={{ textAlign: "right" }}>
                  <b>{p.sales} sale{p.sales === 1 ? "" : "s"}</b>
                  <small className="muted" style={{ display: "block" }}>{p.earned} {p.symbol} earned</small>
                </div>
              </div>
              {p.open && (
                <>
                  <CopyField label="For AI agents (x402)" value={`${origin}/api/x402/pay/${p.code}`} />
                  <CopyField label={t("For people")} value={`${origin}/pay/${p.code}`} />
                </>
              )}
              <div className="connect-row">
                <button className="btn btn-ghost btn-sm" onClick={() => setOpenCode(openCode === p.code ? null : p.code)}>{openCode === p.code ? "Hide sales" : "Sales"}</button>
                {p.open && <button className="btn btn-ghost btn-sm" onClick={() => stop(p.code)}>Stop selling</button>}
              </div>
              {openCode === p.code && <Sales code={p.code} />}
            </div>
          ))}
        </div>
      )}

      <form className="card card-pad form-grid" onSubmit={create}>
        <h2 style={{ margin: 0 }}>{products.length ? "Sell something else" : "Sell something"}</h2>
        <label className="field">{t("What is it?")}<input className="input" value={form.name} onChange={set("name")} placeholder={t("Market report, API access, a download")} maxLength={80} required /></label>
        <label className="field">{t("Short description")}<small>{t("Buyers and agents see this before they pay.")}</small><input className="input" value={form.description} onChange={set("description")} maxLength={280} /></label>
        <AssetPicker label={t("You receive")} assets={assets} value={assetId} onChange={setAssetId} />
        <ReceiveChoice value={onNear ? receive : "private"} onChange={setReceive} onNear={onNear} />
        <label className="field">{t("Price")}<input className="input" inputMode="decimal" value={form.amount} onChange={set("amount")} placeholder="0.00" required /></label>
        <div className="segmented" role="radiogroup" aria-label="What the buyer gets">
          <button type="button" role="radio" aria-checked={form.kind === "text"} onClick={() => setForm({ ...form, kind: "text" })}>A text or link</button>
          <button type="button" role="radio" aria-checked={form.kind === "api"} onClick={() => setForm({ ...form, kind: "api" })}>My API</button>
        </div>
        {form.kind === "text" ? (
          <label className="field">{t("What the buyer gets")}<small>{t("A message, a code or a download link. Shown only after payment.")}</small><textarea className="input" rows={4} value={form.text} onChange={set("text")} maxLength={4000} required /></label>
        ) : (
          <>
            <label className="field">{t("Your API address")}<small>{t("Scrim calls it after each confirmed payment and passes the answer to the buyer.")}</small><input className="input mono" value={form.url} onChange={set("url")} placeholder="https://api.example.com/report" required /></label>
            <div className="connect-row">
              <label className="field" style={{ flex: 1 }}>{t("Secret header (optional)")}<input className="input mono" value={form.headerName} onChange={set("headerName")} placeholder={t("X-Api-Key")} /></label>
              <label className="field" style={{ flex: 1 }}>{t("Value")}<input className="input mono" value={form.headerValue} onChange={set("headerValue")} type="password" /></label>
            </div>
          </>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg" disabled={busy || !assetId}>{busy && <Spinner />} Start selling</button>
      </form>
    </div>
  );
}

function Sales({ code }: { code: string }) {
  const t = useT();
  const { data, loading } = useApi<{ sales: Sale[] }>(`/products/${code}`, { every: 15_000 });
  if (loading && !data) return <Spinner />;
  const sales = data?.sales ?? [];
  if (sales.length === 0) return <p className="muted">{t("No sales yet.")}</p>;
  return (
    <table className="table">
      <thead><tr><th>{t("When")}</th><th>{t("Paid with")}</th><th>{t("You received")}</th><th>{t("Status")}</th></tr></thead>
      <tbody>
        {sales.map((s, i) => (
          <tr key={i}>
            <td>{new Date(s.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
            <td>{s.paidWith}</td>
            <td className="amt">{s.received}</td>
            <td><StateChip status={s.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { AssetPicker, CopyField, fmt, StateChip, type AssetInfo } from "./money";
import { PayFromWallet } from "./PayFromWallet";
import { Spinner } from "./ui";

type LinkView = { code: string; to: string; symbol: string; chainName: string; display: string; note: string; status: string };
type Payment = { id: string; status: string; amountIn: string; fromAsset: { symbol: string; chainName: string; decimals: number }; deposit: { address: string; memo: string | null; network: string; minimum: string | null; evm?: { chainId: number; token: `0x${string}` | null } | null } | null };

// What a buyer receives once their payment is confirmed: the seller's text or link, or their API's answer.
function Bought({ delivered }: { delivered: { status: number; contentType: string; body: string } | null }) {
  if (!delivered) return <div className="notice info"><Spinner /> Paid. Getting what you bought…</div>;
  let text = delivered.body;
  try {
    const j = JSON.parse(delivered.body) as { content?: string };
    text = typeof j.content === "string" ? j.content : JSON.stringify(j, null, 2);
  } catch { /* not JSON: show as sent */ }
  return (
    <div className="form-grid">
      <div className={`notice ${delivered.status === 200 ? "good" : "danger"}`}>{delivered.status === 200 ? "Paid. Here is what you bought. Keep a copy: this page shows it only now." : "Paid, but the seller's service didn't answer. Ask the seller for help."}</div>
      {delivered.status === 200 && <div className="code"><pre style={{ whiteSpace: "pre-wrap" }}>{text}</pre></div>}
    </div>
  );
}

export function PayPage({ code }: { code: string }) {
  const { data, error: loadError } = useApi<{ link: LinkView; product: { name: string; description: string } | null }>(`/pay/${code}`);
  const [delivered, setDelivered] = useState<{ status: number; contentType: string; body: string } | null>(null);
  const { data: list } = useApi<{ assets: AssetInfo[] }>("/assets/public");
  const [assetId, setAssetId] = useState("");
  const [refund, setRefund] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [payment, setPayment] = useState<Payment | null>(null);
  const assets = (list?.assets ?? []).map((a) => ({ ...a, priceUsd: 0, canAdd: true }));
  const picked = assets.find((a) => a.assetId === assetId);

  useEffect(() => {
    if (!payment || ["success", "refunded", "failed", "expired"].includes(payment.status)) return;
    const timer = setInterval(async () => {
      try {
        const r = await api<{ payment: Payment; delivered: typeof delivered }>(`/pay/${code}/status/${payment.id}`);
        setPayment(r.payment);
        if (r.delivered) setDelivered(r.delivered);
      } catch { /* keep last state */ }
    }, 4000);
    return () => clearInterval(timer);
  }, [payment, code]);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setPayment((await api<{ payment: Payment }>(`/pay/${code}/start`, { body: { fromAssetId: assetId, refundAddress: refund } })).payment);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment.");
    } finally {
      setBusy(false);
    }
  }

  if (loadError) return <div className="narrow"><div className="card empty"><span className="icon">?</span><h3>This link doesn't work</h3><p>{loadError}</p></div></div>;
  if (!data) return <div className="narrow"><div className="skeleton" /></div>;
  const link = data.link;
  const product = data.product;

  return (
    <div className="narrow">
      <div className="card card-pad form-grid">
        <div>
          <span className="eyebrow">{product ? "Buy" : "Payment request"}</span>
          <h1 style={{ marginTop: 10 }}>{product ? `${product.name} · ${link.display} ${link.symbol}` : `${link.to} is asking for ${link.display} ${link.symbol}`}</h1>
          {product ? product.description && <p className="muted" style={{ marginTop: 6 }}>{product.description}</p> : link.note && <p className="muted" style={{ marginTop: 6 }}>{link.note}</p>}
        </div>
        {link.status !== "open" ? (
          <div className={`notice ${link.status === "paid" ? "good" : ""}`}>{link.status === "paid" ? "This request has been paid. Thank you." : "This link is closed."}</div>
        ) : !payment ? (
          <form className="form-grid" onSubmit={start}>
            <AssetPicker label="Pay with" assets={assets} value={assetId} onChange={setAssetId} hint="Any coin, on any network. No account needed." />
            <label className="field">Where should we return your money if something goes wrong?
              <small>An address of yours on {picked?.chainName ?? "that network"}.</small>
              <input className="input mono" value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="Paste your address" autoComplete="off" spellCheck={false} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn btn-primary btn-lg" disabled={busy || !assetId}>{busy && <Spinner />} Get payment address</button>
          </form>
        ) : (
          <div className="form-grid">
            <div className="between"><h2>Send {fmt(payment.amountIn, payment.fromAsset.decimals)} {payment.fromAsset.symbol}</h2><StateChip status={payment.status} /></div>
            {payment.deposit && payment.status === "awaiting_deposit" && (
              <>
                <CopyField label={`Address on ${payment.deposit.network}`} value={payment.deposit.address} />
                {payment.deposit.memo && <CopyField label="Memo (required)" value={payment.deposit.memo} />}
                <ul className="checklist">
                  <li>Send exactly <b>{fmt(payment.amountIn, payment.fromAsset.decimals)} {payment.fromAsset.symbol}</b> on <b>{payment.fromAsset.chainName}</b>.</li>
                  <li>Use this address once. It's made for this payment.</li>
                  <li>This page updates by itself when your payment arrives.</li>
                </ul>
                {payment.deposit.evm && (
                  <PayFromWallet to={payment.deposit.address} chainId={payment.deposit.evm.chainId} token={payment.deposit.evm.token}
                    symbol={payment.fromAsset.symbol} decimals={payment.fromAsset.decimals} minimum={null} exact={payment.amountIn} />
                )}
              </>
            )}
            {payment.status === "processing" && <div className="notice info"><Spinner /> We see your payment. It's being delivered.</div>}
            {payment.status === "success" && !product && <div className="notice good">Paid. {link.to} has received {link.display} {link.symbol}. You can close this page.</div>}
            {payment.status === "success" && product && <Bought delivered={delivered} />}
            {["refunded", "failed", "expired"].includes(payment.status) && <div className="notice danger">This payment didn't complete. Anything you sent is returned to the address you gave.</div>}
          </div>
        )}
      </div>
      <p className="muted small-print" style={{ textAlign: "center", marginTop: 16 }}>Payments to Scrim accounts are private. Only {link.to} can see what they receive.</p>
    </div>
  );
}

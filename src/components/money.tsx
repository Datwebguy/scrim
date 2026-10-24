"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/client/api";
import { formatAmount } from "@/protocol/amount";
import { useToast } from "./ui";

export type AssetInfo = { assetId: string; symbol: string; network: string; networkName: string; decimals: number; priceUsd: number; canAdd: boolean };

let assetsPromise: Promise<AssetInfo[]> | null = null;
export function useAssets(): AssetInfo[] {
  const [assets, setAssets] = useState<AssetInfo[]>([]);
  useEffect(() => {
    assetsPromise ??= api<{ assets: AssetInfo[] }>("/assets").then((r) => r.assets).catch((e) => { assetsPromise = null; throw e; });
    assetsPromise.then(setAssets).catch(() => {});
  }, []);
  return assets;
}

export const fmt = (minor: string | bigint, decimals: number, min = 2) => formatAmount(BigInt(minor), decimals, min);
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });
export const SENT_STATES = new Set(["processing", "success", "refunded", "failed"]);

const PREFERRED_NETWORKS = ["near", "base", "eth"];
const preferred = (options: AssetInfo[], keep?: string) =>
  options.find((o) => o.network === keep) ?? PREFERRED_NETWORKS.map((n) => options.find((o) => o.network === n)).find(Boolean) ?? options[0];

const POPULAR = ["USDC", "USDT", "ETH", "BTC", "NEAR", "SOL", "ZEC", "XRP", "TON", "DOGE", "SUI", "TRX", "BNB"];

// Pick a coin, then the network it lives on. Simple, native, and works on every phone.
export function AssetPicker({ label, assets, value, onChange, hint }: { label: string; assets: AssetInfo[]; value: string; onChange: (assetId: string) => void; hint?: string }) {
  const coins = useMemo(() => {
    const symbols = [...new Set(assets.map((a) => a.symbol))];
    return symbols.sort((a, b) => {
      const ia = POPULAR.indexOf(a), ib = POPULAR.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
    });
  }, [assets]);
  const current = assets.find((a) => a.assetId === value);
  const networks = assets.filter((a) => a.symbol === (current?.symbol ?? coins[0]));

  useEffect(() => {
    if (!current && assets.length) onChange(preferred(assets.filter((a) => a.symbol === coins[0]))?.assetId ?? assets[0].assetId);
  }, [current, assets, coins, onChange]);

  return (
    <fieldset className="field picker">
      <legend>{label}</legend>
      {hint && <small>{hint}</small>}
      <div className="form-row">
        <select className="select" aria-label={`${label}: coin`} value={current?.symbol ?? ""} onChange={(e) => {
          const options = assets.filter((a) => a.symbol === e.target.value);
          onChange(preferred(options, current?.network).assetId);
        }}>
          {coins.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" aria-label={`${label}: network`} value={current?.assetId ?? ""} onChange={(e) => onChange(e.target.value)}>
          {networks.map((n) => <option key={n.assetId} value={n.assetId}>{n.networkName}</option>)}
        </select>
      </div>
    </fieldset>
  );
}

export function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  const toast = useToast();
  return (
    <div className="copyfield">
      <span className="section-label">{label}</span>
      <div className="copyrow">
        <code className={mono ? "mono" : ""}>{value}</code>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(value); toast("Copied"); }}>Copy</button>
      </div>
    </div>
  );
}

const CHIP: Record<string, [string, string]> = {
  awaiting_deposit: ["Waiting for your deposit", "pill-amber"], awaiting_signature: ["Needs your approval", "pill-amber"],
  processing: ["On its way", "pill-blue"], success: ["Done", "pill-green"], refunded: ["Refunded", ""], failed: ["Didn't go through", "pill-red"],
  expired: ["Expired", ""], cancelled: ["Cancelled", ""],
};
export function StateChip({ status }: { status: string }) {
  const [text, tone] = CHIP[status] ?? [status, ""];
  return <span className={`pill ${tone}`}>{text}</span>;
}

export const KIND_LABEL: Record<string, string> = { add: "Added money", swap: "Swapped", send: "Sent privately", withdraw: "Sent out", link_payment: "Received by link" };

export type TransferView = {
  id: string; kind: string; status: string; createdAt: string; expiresAt: string;
  fromAsset: { assetId: string; symbol: string; networkName: string; decimals: number };
  toAsset: { assetId: string; symbol: string; networkName: string; decimals: number };
  amountIn: string; amountOut: string; recipient: string | null; note: string;
  deposit: { address: string; memo: string | null; network: string; minimum: string | null } | null;
  intentToSign: { message: string; nonce: string; recipient: string } | null;
  resultHashes: string[]; etaSeconds: number | null; teamRequestId: string | null;
};

export function Heading({ eyebrow, title, text }: { eyebrow: string; title: string; text?: string }) {
  return (
    <div className="page-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        {text && <p className="muted" style={{ marginTop: 8, maxWidth: 560 }}>{text}</p>}
      </div>
    </div>
  );
}

// Shown wherever money can move, until the payment network connection is switched on.
export function useCapabilities() {
  const [caps, setCaps] = useState<{ privateTransfers: boolean } | null>(null);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => setCaps({ privateTransfers: Boolean(h.capabilities?.privateTransfers) })).catch(() => setCaps({ privateTransfers: true }));
  }, []);
  return caps;
}

export function NotSwitchedOn() {
  const caps = useCapabilities();
  if (!caps || caps.privateTransfers) return null;
  return <div className="notice">Adding money, swapping and sending are being switched on. You can already unlock your private balance and see what you hold.</div>;
}

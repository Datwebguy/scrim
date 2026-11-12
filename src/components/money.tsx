"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { StatusMark } from "./StatusMark";
import { useT } from "@/i18n/I18n";
import { api } from "@/client/api";
import { formatAmount } from "@/protocol/amount";
import { useToast } from "./ui";

export type AssetInfo = {
  assetId: string; symbol: string; decimals: number; priceUsd: number | null; icon: string | null;
  chain: string; chainName: string; chainIcon: string | null; canAdd: boolean;
};

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
// Shows at most four decimals, for coins with long balances.
export const trimDecimals = (v: string) => v.replace(/^(\d[\d,]*\.\d{0,4})\d*$/, "$1");
export const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: n < 1 ? 4 : 2 });

// A coin's real logo, with its chain's logo as a small badge. Coins with no published logo show their letters.
export function TokenLogo({ icon, symbol, chainIcon, size = 36 }: { icon: string | null; symbol: string; chainIcon?: string | null; size?: number }) {
  const badge = Math.round(size * 0.42);
  return (
    <span className="tlogo" style={{ width: size, height: size }}>
      {icon ? <img src={icon} alt="" width={size} height={size} loading="lazy" referrerPolicy="no-referrer" /> : <span className="tletters" style={{ fontSize: size * 0.3 }}>{symbol.slice(0, 3)}</span>}
      {chainIcon && <img className="tbadge" src={chainIcon} alt="" width={badge} height={badge} loading="lazy" referrerPolicy="no-referrer" />}
    </span>
  );
}

const POPULAR = ["USDC", "USDT", "ETH", "BTC", "NEAR", "SOL", "ZEC", "XRP", "TON", "DOGE", "SUI", "TRX", "BNB"];
const PREFERRED_CHAINS = ["near", "base", "eth"];

function sortForPicking(assets: AssetInfo[]) {
  const rank = (a: AssetInfo) => {
    const i = POPULAR.indexOf(a.symbol);
    const c = PREFERRED_CHAINS.indexOf(a.chain);
    return (i === -1 ? 99 : i) * 10 + (c === -1 ? 9 : c);
  };
  return [...assets].sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol) || a.chainName.localeCompare(b.chainName));
}

// Choose a coin and the chain it lives on from one searchable list, each with its real logo.
export type Balances = Record<string, { display: string; usd: number | null }>;

export function AssetPicker({ label, assets, value, onChange, hint, empty, pill, wide, balances }: { label: string; assets: AssetInfo[]; value: string; onChange: (assetId: string) => void; hint?: string; empty?: string; pill?: boolean; wide?: boolean; balances?: Balances }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const box = useRef<HTMLDivElement>(null);
  // Coins the person holds come first, largest value first; every other coin follows.
  const sorted = useMemo(() => {
    const all = sortForPicking(assets);
    if (!balances) return all;
    const mine = all.filter((a) => balances[a.assetId]).sort((x, y) => (balances[y.assetId].usd ?? 0) - (balances[x.assetId].usd ?? 0));
    return [...mine, ...all.filter((a) => !balances[a.assetId])];
  }, [assets, balances]);
  const current = assets.find((a) => a.assetId === value);

  useEffect(() => {
    if (!current && sorted.length) onChange(sorted[0].assetId);
  }, [current, sorted, onChange]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [open]);

  const q = query.trim().toLowerCase();
  const shown = q ? sorted.filter((a) => `${a.symbol} ${a.chainName}`.toLowerCase().includes(q)) : sorted;

  return (
    <div className={`field picker${pill ? " coinpill" : ""}${wide ? " wide" : ""}`} ref={box}>
      {!pill && <span className="picker-label">{label}</span>}
      {!pill && hint && <small>{hint}</small>}
      <button type="button" className="picker-button" aria-label={pill ? label : undefined} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {current ? (
          pill
            ? <><TokenLogo icon={current.icon} symbol={current.symbol} chainIcon={current.chainIcon} size={28} /><span><b>{current.symbol}</b><small>{current.chainName}</small></span></>
            : <><TokenLogo icon={current.icon} symbol={current.symbol} chainIcon={current.chainIcon} /><span><b>{current.symbol}</b><small>{current.chainName}</small></span></>
        ) : <span className="muted">{empty ?? "Loading coins…"}</span>}
        <span className="picker-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="picker-panel">
          <input className="input" autoFocus placeholder={t("Search a coin or chain")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search coins" />
          <ul role="listbox" aria-label={label}>
            {shown.length === 0 && <li className="picker-empty">Nothing matches "{query}"</li>}
            {shown.map((a, i) => {
              const mine = balances?.[a.assetId];
              const heading = balances && !q && (i === 0 || (!mine && balances[shown[i - 1].assetId]))
                ? (mine ? t("Your coins") : t("All coins")) : null;
              return (
                <li key={a.assetId} role="option" aria-selected={a.assetId === value}>
                  {heading && <span className="picker-group">{heading}</span>}
                  <button type="button" onClick={() => { onChange(a.assetId); setOpen(false); setQuery(""); }}>
                    <TokenLogo icon={a.icon} symbol={a.symbol} chainIcon={a.chainIcon} size={32} />
                    <span><b>{a.symbol}</b><small>{a.chainName}</small></span>
                    {mine
                      ? <span className="picker-price picker-held"><b>{mine.display}</b>{mine.usd !== null && <small className="muted">{usd(mine.usd)}</small>}</span>
                      : a.priceUsd !== null && <span className="muted picker-price">{usd(a.priceUsd)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

export function CopyField({ value, label, mono = true }: { value: string; label: string; mono?: boolean }) {
  const t = useT();
  const toast = useToast();
  return (
    <div className="copyfield">
      <span className="section-label">{label}</span>
      <div className="copyrow">
        <code className={mono ? "mono" : ""}>{value}</code>
        <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { await navigator.clipboard.writeText(value); toast(t("Copied")); }}>Copy</button>
      </div>
    </div>
  );
}

const CHIP: Record<string, [string, string]> = {
  awaiting_deposit: ["Waiting for your deposit", "pill-amber"], awaiting_signature: ["Needs your approval", "pill-amber"],
  processing: ["On its way", "pill-blue"], success: ["Done", "pill-green"], refunded: ["Refunded", ""], failed: ["Didn't go through", "pill-red"],
  expired: ["Expired", ""], cancelled: ["Cancelled", ""],
};
// Still on its way after its deadline: NEAR Intents either finishes it or returns the coins.
export const isLate = (tr: { status: string; expiresAt: string }) => tr.status === "processing" && new Date(tr.expiresAt).getTime() < Date.now();

export function StateChip({ status, late = false }: { status: string; late?: boolean }) {
  const t = useT();
  const [text, tone] = late ? ["Taking longer", "pill-blue"] : CHIP[status] ?? [status, ""];
  const mark = status === "success" ? "done" : status === "processing" ? "moving" : null;
  return <span className={`pill ${tone}${mark ? " has-mark" : ""}`}>{mark && <StatusMark state={mark} size={14} />}{t(text)}</span>;
}

export const KIND_LABEL: Record<string, string> = { add: "Added money", swap: "Swapped", send: "Sent", withdraw: "Sent out", link_payment: "Received by link" };

type Leg = { assetId: string; symbol: string; chainName: string; decimals: number; icon: string | null; chainIcon: string | null };
export type TransferView = {
  id: string; kind: string; status: string; createdAt: string; expiresAt: string;
  fromAsset: Leg; toAsset: Leg;
  amountIn: string; amountOut: string; minAmountOut?: string; recipient: string | null; note: string;
  deposit: { address: string; memo: string | null; chainName: string; minimum: string | null; evm: { chainId: number; token: `0x${string}` | null } | null; solana: { mint: string | null } | null } | null; // evm, solana: let a connected wallet pay it in one tap
  intentToSign: { message: string; nonce: string; recipient: string } | null;
  resultHashes: string[]; etaSeconds: number | null; teamRequestId: string | null; fromWallet?: boolean;
};

export function Heading({ eyebrow, title, text, back = eyebrow !== "Home" }: { eyebrow: string; title: string; text?: string; back?: boolean }) {
  const t = useT();
  const router = useRouter();
  // Back to where the person came from inside Scrim; opened directly, back goes Home.
  const goBack = () => {
    const fromScrim = typeof document !== "undefined" && document.referrer.startsWith(window.location.origin);
    if (fromScrim && window.history.length > 1) router.back();
    else router.push("/app");
  };
  return (
    <div className="page-head">
      {back && (
        <button type="button" className="page-back" onClick={goBack} aria-label={t("Back")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
      )}
      <div>
        <span className="eyebrow">{t(eyebrow)}</span>
        <h1>{t(title)}</h1>
        {text && <p className="muted" style={{ marginTop: 8, maxWidth: 560 }}>{t(text)}</p>}
      </div>
    </div>
  );
}

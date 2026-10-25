"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useApi } from "@/client/use-api";
import { NETWORK_INFO, type Network } from "@/protocol/networks";
import { TokenLogo, trimDecimals, usd } from "./money";
import { useSession, useSwitchNetwork } from "./session";
import { Initials } from "./ui";

type WalletCoin = { id: string; symbol: string; display: string; icon: string | null };
type PrivateCoin = { assetId: string; symbol: string; display: string; usd: number | null; icon: string | null; chainIcon: string | null };
type PrivateView = { status: string; totalUsd: number; holdings: PrivateCoin[] };

const middle = (id: string) => (id.length > 13 ? `${id.slice(0, 5)}…${id.slice(-4)}` : id);

const CopyIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></svg>
);
const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>
);
const PowerIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v8" /><path d="M6.3 6.8a8 8 0 1 0 11.4 0" /></svg>
);

// Your account at a glance, as a side panel: short address with copy and disconnect, the network,
// and what the wallet holds.
export function AccountMenu() {
  const { accountId, network } = useSession();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="acct-chip" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label="Open wallet">
        <span className={`dot ${network}`} aria-hidden="true" />
        <Initials name={accountId} className="avatar" />
      </button>
      {open && createPortal(<Panel onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

function Panel({ onClose }: { onClose: () => void }) {
  const { accountId, network, otherNetworks } = useSession();
  const leave = useSwitchNetwork();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"wallet" | "private">("wallet");
  const privateMoney = NETWORK_INFO[network].privateMoney;
  const { data: wallet, loading } = useApi<{ holdings: WalletCoin[] }>("/wallet", { every: 20_000 });
  const { data: priv } = useApi<PrivateView>(privateMoney && tab === "private" ? "/private" : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; };
  }, [onClose]);

  async function go(next?: Network) {
    setBusy(true);
    await leave(next);
  }

  const networks = [network, ...otherNetworks] as Network[];
  return (
    <div className="panel-root">
      <div className="panel-backdrop" onClick={onClose} />
      <aside className="panel" role="dialog" aria-label="Wallet">
        <header className="panel-head">
          <Initials name={accountId} className="avatar" />
          <div className="panel-id"><b title={accountId}>{middle(accountId)}</b></div>
          <button className="icon-btn" title="Copy address" aria-label="Copy address" onClick={async () => { try { await navigator.clipboard.writeText(accountId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* not available */ } }}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
          <button className="icon-btn danger" title="Disconnect wallet" aria-label="Disconnect wallet" disabled={busy} onClick={() => go()}><PowerIcon /></button>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </header>

        {otherNetworks.length > 0 && (
          <div className="panel-nets" role="group" aria-label="Network">
            {networks.sort().map((n) => (
              <button key={n} aria-pressed={n === network} disabled={busy} onClick={() => n !== network && go(n)}>
                {NETWORK_INFO[n].label}
              </button>
            ))}
          </div>
        )}

        {privateMoney && (
          <div className="panel-tabs" role="tablist">
            <button role="tab" aria-selected={tab === "wallet"} onClick={() => setTab("wallet")}>Wallet</button>
            <button role="tab" aria-selected={tab === "private"} onClick={() => setTab("private")}>Private</button>
          </div>
        )}

        <div className="panel-body">
          {tab === "private" && privateMoney ? (
            !priv ? <div className="skeleton" /> : priv.status !== "active" ? <p className="muted">Unlock your private balance from Home.</p> : (
              <>
                <div className="panel-total">{usd(priv.totalUsd)}</div>
                {priv.holdings.length === 0 ? <p className="muted">Nothing here yet.</p> : (
                  <ul className="panel-list">
                    {priv.holdings.map((h) => (
                      <li key={h.assetId}><TokenLogo icon={h.icon} symbol={h.symbol} chainIcon={h.chainIcon} size={32} /><b>{h.symbol}</b><span>{h.display}{h.usd !== null && <small>{usd(h.usd)}</small>}</span></li>
                    ))}
                  </ul>
                )}
              </>
            )
          ) : loading && !wallet ? <div className="skeleton" /> : (
            <ul className="panel-list">
              {(wallet?.holdings ?? []).map((h) => (
                <li key={h.id}><TokenLogo icon={h.icon} symbol={h.symbol} size={32} /><b>{h.symbol}</b><span>{trimDecimals(h.display)}</span></li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

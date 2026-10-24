"use client";
import { useEffect, useRef, useState } from "react";
import { NETWORK_INFO } from "@/protocol/networks";
import { useSession, useSwitchNetwork } from "./session";
import { Initials } from "./ui";

// The connected wallet: its address, the network, and ways to switch network or disconnect.
export function AccountMenu() {
  const { accountId, network, otherNetworks } = useSession();
  const leave = useSwitchNetwork();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const short = accountId.length > 14 ? `${accountId.slice(0, 6)}…${accountId.slice(-5)}` : accountId;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function go(next?: Parameters<typeof leave>[0]) {
    setBusy(true);
    await leave(next);
  }

  return (
    <div className="acct-menu" ref={box}>
      <button className="acct-chip" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu">
        <span className={`dot ${network}`} aria-hidden="true" />
        <Initials name={accountId} className="avatar" />
        <b>{short}</b>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="acct-pop" role="menu">
          <div className="acct-pop-id">
            <small>{NETWORK_INFO[network].label} account</small>
            <code title={accountId}>{accountId}</code>
            <button
              className="btn btn-ghost btn-sm"
              onClick={async () => {
                try { await navigator.clipboard.writeText(accountId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* copy not available */ }
              }}
            >
              {copied ? "Copied" : "Copy address"}
            </button>
          </div>
          {otherNetworks.map((n) => (
            <button key={n} role="menuitem" className="acct-item" disabled={busy} onClick={() => go(n)}>
              Use {NETWORK_INFO[n].label.toLowerCase()} <small>disconnects this wallet</small>
            </button>
          ))}
          <button role="menuitem" className="acct-item danger" disabled={busy} onClick={() => go()}>
            Disconnect wallet
          </button>
        </div>
      )}
    </div>
  );
}

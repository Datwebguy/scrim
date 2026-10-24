"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NETWORK_INFO, type Network } from "@/protocol/networks";
import { SessionProvider, useSwitchNetwork } from "./session";
import { Initials, ToastProvider } from "./ui";

const NAV: { href: string; label: string; privateMoney?: boolean; match?: (p: string) => boolean }[] = [
  { href: "/app", label: "Home", match: (p) => p === "/app" },
  { href: "/app/add", label: "Add money", privateMoney: true },
  { href: "/app/send", label: "Send" },
  { href: "/app/swap", label: "Swap", privateMoney: true },
  { href: "/app/requests", label: "Get paid", privateMoney: true },
  { href: "/app/proofs", label: "Proofs", privateMoney: true },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/team", label: "Team" },
];

export function Shell({ accountId, network, otherNetworks, teamPending, children }: { accountId: string; network: Network; otherNetworks: Network[]; teamPending: number; children: React.ReactNode }) {
  return (
    <SessionProvider value={{ accountId, network, otherNetworks }}>
      <ToastProvider>
        <Frame accountId={accountId} network={network} otherNetworks={otherNetworks} teamPending={teamPending}>{children}</Frame>
      </ToastProvider>
    </SessionProvider>
  );
}

function Frame({ accountId, network, otherNetworks, teamPending, children }: { accountId: string; network: Network; otherNetworks: Network[]; teamPending: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const leave = useSwitchNetwork();
  const [open, setOpen] = useState(false);
  const short = accountId.length > 26 ? `${accountId.slice(0, 10)}…${accountId.slice(-6)}` : accountId;
  const info = NETWORK_INFO[network];

  return (
        <div className="ws">
          <aside className={`ws-side ${open ? "open" : ""}`}>
            <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" />scrim</Link>
            <nav aria-label="Main" style={{ display: "grid", gap: 4 }}>
              {NAV.map((item) => {
                const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
                const unavailable = item.privateMoney && !info.privateMoney;
                return (
                  <Link key={item.href} href={item.href} className={`ws-link ${active ? "active" : ""}`} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}>
                    <span style={unavailable ? { opacity: 0.55 } : undefined}>{item.label}</span>
                    {unavailable && <small>mainnet</small>}
                    {item.href === "/app/team" && teamPending > 0 && <span className="count" title="Waiting for you">{teamPending}</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="ws-account">
              <span className={`pill ${network === "mainnet" ? "pill-green" : "pill-amber"}`} style={{ marginBottom: 10 }}>{info.label}</span>
              <div className="who">
                <Initials name={accountId} className="avatar" />
                <div style={{ minWidth: 0 }}><b title={accountId}>{short}</b><small>{network === "mainnet" ? "Private account" : "Practice account"}</small></div>
              </div>
              {otherNetworks.map((n) => <button key={n} onClick={() => leave(n)}>Switch to {NETWORK_INFO[n].label.toLowerCase()}</button>)}
              <button onClick={() => leave()}>Sign out</button>
            </div>
          </aside>
          <div className="ws-main">
            <div className="ws-top">
              <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" style={{ width: 24, height: 24 }} />scrim</Link>
              <span className="ws-top-actions">
                {otherNetworks.map((n) => <button key={n} onClick={() => leave(n)}>Use {NETWORK_INFO[n].label.toLowerCase()}</button>)}
                <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Close" : "Menu"}</button>
              </span>
            </div>
            {network === "testnet" && <div className="net-banner">You're on testnet: free test coins, no real money.</div>}
            <div className="ws-body">{children}</div>
          </div>
        </div>
  );
}

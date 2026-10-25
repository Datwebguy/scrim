"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NETWORK_INFO, type Network } from "@/protocol/networks";
import { AccountMenu } from "./AccountMenu";
import { SessionProvider } from "./session";
import { ToastProvider } from "./ui";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Wordmark";

const NAV: { href: string; label: string; privateMoney?: boolean; match?: (p: string) => boolean }[] = [
  { href: "/app", label: "Home", match: (p) => p === "/app" },
  { href: "/app/add", label: "Add money", privateMoney: true },
  { href: "/app/send", label: "Send" },
  { href: "/app/swap", label: "Swap", privateMoney: true },
  { href: "/app/requests", label: "Get paid", privateMoney: true },
  { href: "/app/sell", label: "Sell", privateMoney: true },
  { href: "/app/proofs", label: "Proofs", privateMoney: true },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/ask", label: "Ask" },
  { href: "/app/accounts", label: "Accounts" },
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
  const [open, setOpen] = useState(false);
  const info = NETWORK_INFO[network];

  return (
        <div className="ws">
          <aside className={`ws-side ${open ? "open" : ""}`}>
            <div className="ws-side-head on-dark-toggle"><Link href="/" className="brand"><img src="/scrim-mark.png" alt="" /><Wordmark /></Link><ThemeToggle /></div>
            <nav aria-label="Main" style={{ display: "grid", gap: 4 }}>
              {NAV.filter((item) => !item.privateMoney || info.privateMoney).map((item) => {
                const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <Link key={item.href} href={item.href} className={`ws-link ${active ? "active" : ""}`} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}>
                    <span>{item.label}</span>
                    {item.href === "/app/accounts" && teamPending > 0 && <span className="count" title="Waiting for you">{teamPending}</span>}
                  </Link>
                );
              })}
            </nav>
            <div className="ws-account">
              <AccountMenu />
            </div>
          </aside>
          <div className="ws-main">
            <div className="ws-top">
              <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" style={{ width: 24, height: 24 }} /><Wordmark /></Link>
              <span className="ws-top-actions on-dark-toggle">
                <ThemeToggle />
                <AccountMenu />
                <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Close" : "Menu"}</button>
              </span>
            </div>
            {network === "testnet" && <div className="net-banner">You're on testnet: free test coins, no real money.</div>}
            <div className="ws-body">{children}</div>
          </div>
        </div>
  );
}

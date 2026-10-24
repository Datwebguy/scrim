"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOutWallet } from "@/client/wallet";
import { Initials, ToastProvider } from "./ui";

const NAV: { href: string; label: string; match?: (p: string) => boolean }[] = [
  { href: "/app", label: "Home", match: (p) => p === "/app" },
  { href: "/app/add", label: "Add money" },
  { href: "/app/send", label: "Send" },
  { href: "/app/swap", label: "Swap" },
  { href: "/app/requests", label: "Get paid" },
  { href: "/app/proofs", label: "Proofs" },
  { href: "/app/activity", label: "Activity" },
  { href: "/app/team", label: "Team" },
];

export function Shell({ accountId, network, teamPending, children }: { accountId: string; network: string; teamPending: number; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const short = accountId.length > 26 ? `${accountId.slice(0, 10)}…${accountId.slice(-6)}` : accountId;

  async function signOut() {
    await signOutWallet();
    router.push("/app");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div className="ws">
        <aside className={`ws-side ${open ? "open" : ""}`}>
          <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" />scrim</Link>
          <nav aria-label="Main" style={{ display: "grid", gap: 4 }}>
            {NAV.map((item) => {
              const active = item.match ? item.match(pathname) : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link key={item.href} href={item.href} className={`ws-link ${active ? "active" : ""}`} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined}>
                  <span>{item.label}</span>
                  {item.href === "/app/team" && teamPending > 0 && <span className="count" title="Waiting for you">{teamPending}</span>}
                </Link>
              );
            })}
          </nav>
          <div className="ws-account">
            <div className="who">
              <Initials name={accountId} className="avatar" />
              <div style={{ minWidth: 0 }}><b title={accountId}>{short}</b><small>{network === "mainnet" ? "Private account" : `NEAR ${network}`}</small></div>
            </div>
            <button onClick={signOut}>Sign out</button>
          </div>
        </aside>
        <div className="ws-main">
          <div className="ws-top">
            <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" style={{ width: 24, height: 24 }} />scrim</Link>
            <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? "Close" : "Menu"}</button>
          </div>
          <div className="ws-body">{children}</div>
        </div>
      </div>
    </ToastProvider>
  );
}

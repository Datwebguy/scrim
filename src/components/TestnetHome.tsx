"use client";
import Link from "next/link";
import { useApi } from "@/client/use-api";
import { Heading, TokenLogo, trimDecimals } from "./money";
import { useSession, useSwitchNetwork } from "./session";

type Holding = { id: string; symbol: string; name: string; display: string; icon: string | null };

export function TestnetHome() {
  const { accountId, otherNetworks } = useSession();
  const switchNetwork = useSwitchNetwork();
  const { data, loading, error } = useApi<{ holdings: Holding[] }>("/wallet", { every: 20_000 });
  const native = data?.holdings.find((h) => h.id === "near");

  return (
    <>
      <Heading eyebrow="Home" title="Your testnet wallet" text="Practice with free test coins." />
      <section className="balance-hero" aria-label="Testnet balance">
        <div className="balance-body">
          <span className="muted-on-dark">Test NEAR</span>
          <strong className="balance-figure">{native ? trimDecimals(native.display) : loading ? "…" : "—"}</strong>
          <span className="muted-on-dark">{accountId}</span>
        </div>
        <div className="quick">
          <Link href="/app/send" className="btn btn-signal">Send</Link>
          <Link href="/app/accounts" className="btn btn-light">Accounts</Link>
          <Link href="/app/activity" className="btn btn-light">Activity</Link>
        </div>
      </section>
      {error && <div className="notice danger">{error}</div>}
      <section className="card">
        <div className="card-title"><h3>What you hold</h3></div>
        <ul className="rows">
          {(data?.holdings ?? []).map((h) => (
            <li key={h.id}>
              <TokenLogo icon={h.icon} symbol={h.symbol} />
              <span><b>{h.symbol}</b><small>{h.id === "near" ? "Native coin" : h.name}</small></span>
              <span className="right"><b>{trimDecimals(h.display)}</b></span>
            </li>
          ))}
          {data && data.holdings.length === 1 && native && native.display === "0.00" && <li><span /><span><b>No test coins yet</b><small>Get free test NEAR from the <a href="https://near-faucet.io" target="_blank" rel="noreferrer">NEAR testnet faucet ↗</a>, then come back.</small></span><span /></li>}
        </ul>
      </section>
      {otherNetworks.includes("mainnet") && (
        <p className="fine" style={{ marginTop: 16 }}>Ready for the real thing? <button type="button" className="link-btn" onClick={() => switchNetwork("mainnet")}>Use mainnet</button></p>
      )}
    </>
  );
}

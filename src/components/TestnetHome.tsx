"use client";
import Link from "next/link";
import { useApi } from "@/client/use-api";
import { NETWORK_INFO } from "@/protocol/networks";
import { Heading, TokenLogo } from "./money";
import { useSession } from "./session";

const short = (v: string) => v.replace(/^(\d[\d,]*\.\d{0,4})\d*$/, "$1");

type Holding = { id: string; symbol: string; name: string; display: string; icon: string | null };

export function TestnetHome() {
  const { accountId, network } = useSession();
  const { data, loading, error } = useApi<{ holdings: Holding[] }>("/wallet", { every: 20_000 });
  const explorer = `${NETWORK_INFO[network].explorerUrl}/address/${accountId}`;
  const native = data?.holdings.find((h) => h.id === "near");

  return (
    <>
      <Heading eyebrow="Home" title="Your testnet wallet" text="Practice with free test coins. Everything here is real testnet data read from the blockchain, and nothing is private or worth money." />
      <section className="balance-hero" aria-label="Testnet balance">
        <div className="balance-body">
          <span className="muted-on-dark">Test NEAR</span>
          <strong className="balance-figure">{native ? short(native.display) : loading ? "…" : "—"}</strong>
          <span className="muted-on-dark">{accountId}</span>
        </div>
        <div className="quick">
          <Link href="/app/send" className="btn btn-signal">Send</Link>
          <Link href="/app/team" className="btn btn-light">Team</Link>
          <a href={explorer} target="_blank" rel="noreferrer" className="btn btn-light">View on explorer ↗</a>
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
              <span className="right"><b>{short(h.display)}</b></span>
            </li>
          ))}
          {data && data.holdings.length === 1 && native && native.display === "0.00" && <li><span /><span><b>No test coins yet</b><small>Fund this account with free test NEAR from a testnet faucet.</small></span><span /></li>}
        </ul>
      </section>
      <div className="notice info" style={{ marginTop: 16 }}>Adding money, swaps, payment links and proofs need NEAR Intents, which only exists on mainnet. Team approvals, spending limits and real NEAR transfers all work here.</div>
    </>
  );
}

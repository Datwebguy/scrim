"use client";
import { NETWORK_INFO } from "@/protocol/networks";
import { Heading } from "./money";
import { useSession } from "./session";

export function TestnetActivity() {
  const { accountId, network } = useSession();
  return (
    <div className="narrow">
      <Heading eyebrow="Activity" title="Your testnet activity" text="Testnet transfers are public, so the blockchain explorer is the full record." />
      <div className="card card-pad form-grid">
        <p>Every transfer from {accountId} is listed on the explorer, with its receipt.</p>
        <a className="btn btn-primary" style={{ justifySelf: "start" }} href={`${NETWORK_INFO[network].explorerUrl}/address/${accountId}`} target="_blank" rel="noreferrer">Open on the explorer ↗</a>
        <p className="muted small-print">Team payments you approve and pay appear under Team → History.</p>
      </div>
    </div>
  );
}

"use client";
import { Heading } from "./money";
import { useSwitchNetwork } from "./session";

// Shown on testnet if someone opens a private-money page directly: these features live on mainnet.
export function MainnetOnly({ feature }: { feature: string }) {
  const switchNetwork = useSwitchNetwork();
  return (
    <div className="narrow">
      <Heading eyebrow={feature} title={`${feature} is on mainnet`} />
      <div className="card card-pad form-grid">
        <p className="muted">Practice on testnet with approvals, spending limits and agents. Switch to mainnet when you're ready for private money.</p>
        <button className="btn btn-primary" style={{ justifySelf: "start" }} onClick={() => switchNetwork("mainnet")}>Use mainnet</button>
      </div>
    </div>
  );
}

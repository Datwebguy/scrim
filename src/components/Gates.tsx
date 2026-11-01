"use client";
import { Heading } from "./money";
import { useSwitchNetwork } from "./session";
import { useT } from "@/i18n/I18n";

// Shown on testnet if someone opens a private-money page directly: these features live on mainnet.
export function MainnetOnly({ feature }: { feature: string }) {
  const t = useT();
  const switchNetwork = useSwitchNetwork();
  return (
    <div className="narrow">
      <Heading eyebrow={feature} title={`${feature} is on mainnet`} />
      <div className="card card-pad form-grid">
        <p className="muted">{t("Practice on testnet with approvals, spending limits and agents. Private options live on mainnet. Switch when you're ready.")}</p>
        <button className="btn btn-primary" style={{ justifySelf: "start" }} onClick={() => switchNetwork("mainnet")}>Use mainnet</button>
      </div>
    </div>
  );
}

"use client";
import { useRouter } from "next/navigation";
import { PRIVATE_MONEY_MAINNET_ONLY } from "@/protocol/networks";
import { signOutWallet } from "@/client/wallet";
import { Heading, useCapabilities } from "./money";
import { useSession } from "./session";

// Shown on testnet in place of features that need NEAR Intents, which only exists on mainnet.
export function MainnetOnly({ feature }: { feature: string }) {
  const router = useRouter();
  const { network } = useSession();
  async function toMainnet() {
    await signOutWallet(network);
    router.push("/app?network=mainnet");
    router.refresh();
  }
  return (
    <div className="narrow">
      <Heading eyebrow={feature} title={`${feature} runs on mainnet`} />
      <div className="card card-pad form-grid">
        <p>{PRIVATE_MONEY_MAINNET_ONLY}</p>
        <p className="muted">NEAR's own guidance is to test on mainnet with a separate account and small amounts. Everything else (sign-in, team approvals, spending limits and real NEAR transfers) works on testnet.</p>
        <button className="btn btn-primary" style={{ justifySelf: "start" }} onClick={toMainnet}>Switch to mainnet</button>
      </div>
    </div>
  );
}

// Shown on mainnet until the payment network connection (partner key) is set up on the server.
export function NotSwitchedOn() {
  const { network } = useSession();
  const caps = useCapabilities(network);
  if (!caps || caps.movingMoney || network !== "mainnet") return null;
  return <div className="notice">Adding money, swapping and sending are being switched on. You can already unlock your private balance and see what you hold.</div>;
}

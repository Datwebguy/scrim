"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { signInWithWallet } from "@/client/wallet";
import { Spinner } from "./ui";

export function SignIn({ network }: { network: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function connect() {
    setBusy(true);
    setError("");
    try {
      await signInWithWallet();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-art">
        <Link href="/" className="brand">
          <img src="/scrim-mark.png" alt="" />
          scrim
        </Link>
        <div className="slit" aria-hidden="true" />
        <h2>
          Rules first.
          <br />
          <em>Then money moves.</em>
        </h2>
        <ul>
          <li>Create a personal or team treasury</li>
          <li>Give agents a capped, revocable mandate</li>
          <li>Approve every payment from your own wallet</li>
        </ul>
      </div>
      <div className="gate-form">
        <div>
          <span className="pill plain">NEAR {network}</span>
          <h1>Sign in with your wallet</h1>
          <p>Scrim asks your wallet to sign a one-time message. That proves you own the account. It does not authorize a transaction or move funds.</p>
          <button className="btn btn-primary btn-lg" onClick={connect} disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? "Waiting for your wallet…" : "Connect NEAR wallet"}
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="fine">
            Works with HOT, Meteor, Intear, MyNearWallet, Nightly, OKX and other NEAR wallets. Your key must be a full-access
            key on the account. Scrim checks it on-chain.
          </p>
        </div>
      </div>
    </div>
  );
}

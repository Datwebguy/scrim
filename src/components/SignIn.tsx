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
      setError(e instanceof Error ? e.message : "Sign-in didn't finish. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-art">
        <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" />scrim</Link>
        <div className="slit" aria-hidden="true" />
        <h2>Your money.<br /><em>Your business.</em></h2>
        <ul>
          <li>Hold money that only you can see</li>
          <li>Pay anyone, on any chain, without a trail</li>
          <li>Prove one fact to one person, and nothing more</li>
        </ul>
      </div>
      <div className="gate-form">
        <div>
          {network !== "mainnet" && <span className="pill plain">Test mode · NEAR {network}</span>}
          <h1>Sign in with your wallet</h1>
          <p>Choose your NEAR wallet and approve one message. It proves the account is yours. It can't move any money.</p>
          <button className="btn btn-primary btn-lg" onClick={connect} disabled={busy}>{busy && <Spinner />}{busy ? "Check your wallet…" : "Connect wallet"}</button>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p className="fine">No email. No password. You can use any NEAR wallet, including HOT, Meteor, Intear, MyNearWallet and Nightly. Don't have one yet? Any of them takes a minute to set up.</p>
        </div>
      </div>
    </div>
  );
}

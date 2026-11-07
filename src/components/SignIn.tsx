"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { emailSignInAvailable, sendEmailCode, signInWithEmail } from "@/client/email";
import { connectedAccount, disconnectWallet, signInWithWallet } from "@/client/wallet";
import { isNetwork, NETWORK_INFO, type Network } from "@/protocol/networks";
import { Spinner } from "./ui";
import { Wordmark } from "@/components/Wordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageMenu } from "@/i18n/I18n";
import { useT } from "@/i18n/I18n";

const KEY = "scrim:network";

export function SignIn({ networks }: { networks: Network[] }) {
  const t = useT();
  const router = useRouter();
  const [network, setNetwork] = useState<Network>(networks[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stuck, setStuck] = useState(false);
  const [known, setKnown] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);

  // Remember the last network, or honour ?network= from a "switch network" link.
  useEffect(() => {
    try {
      const wanted = new URLSearchParams(window.location.search).get("network") ?? localStorage.getItem(KEY);
      if (isNetwork(wanted) && networks.includes(wanted)) setNetwork(wanted);
    } catch {
      // Storage can be unavailable; the default is fine.
    }
  }, [networks]);

  // A wallet already connected in this browser: offer to continue with it.
  useEffect(() => {
    let alive = true;
    setKnown(null);
    connectedAccount(network).then((account) => alive && setKnown(account));
    return () => { alive = false; };
  }, [network]);

  // If the wallet does not come back, say so and let the person start again.
  useEffect(() => {
    if (!busy) { setStuck(false); return; }
    const timer = setTimeout(() => setStuck(true), 15_000);
    return () => clearTimeout(timer);
  }, [busy]);

  async function connect() {
    setBusy(true);
    setError("");
    try {
      try { localStorage.setItem(KEY, network); } catch { /* optional */ }
      await signInWithWallet(network);
      router.replace("/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("Sign-in didn't finish. Try again."));
      setBusy(false);
    }
  }

  // The wallet connected in this browser may not be the one the person wants today: let go of it and ask again.
  async function useAnotherWallet() {
    setError("");
    await disconnectWallet(network);
    setKnown(null);
    await connect();
  }

  async function emailStep(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      try { localStorage.setItem(KEY, network); } catch { /* optional */ }
      if (!codeSent) {
        await sendEmailCode(email);
        setCodeSent(true);
        setBusy(false);
        return;
      }
      await signInWithEmail(email, code, network);
      router.replace("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("Sign-in didn't finish. Try again."));
      setBusy(false);
    }
  }

  return (
    <div className="gate">
      <div className="gate-art">
        <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" /><Wordmark /></Link>
        <div className="slit" aria-hidden="true" />
        <h2>{t("Your money.")}<br /><em>{t("Your business.")}</em></h2>
        <ul>
          <li>{t("Hold money you can keep private")}</li>
          <li>{t("Pay anyone, on any chain, in public or in private")}</li>
          <li>{t("Prove one fact to one person")}</li>
        </ul>
      </div>
      <div className="gate-form">
        <div className="gate-theme"><LanguageMenu /><ThemeToggle /></div>
        <div>
          <h1>{t("Sign in with your wallet")}</h1>
          <p>{t("Choose your NEAR wallet and approve one message. It proves the account is yours. It can't move any money.")}</p>

          {networks.length > 1 && (
            <fieldset className="field">
              <legend>{t("Network")}</legend>
              <div className="segmented" role="radiogroup" aria-label="Network">
                {networks.map((n) => (
                  <label key={n}>
                    <input type="radio" name="network" checked={network === n} onChange={() => setNetwork(n)} />
                    <b>{t(NETWORK_INFO[n].label)}</b>
                    <span>{t(n === "mainnet" ? "Real money. Everything works." : "Practice with free test coins.")}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {network === "testnet" && <div className="notice info">{t("Testnet uses free test coins, so nothing here is worth money.")}</div>}
          <button className="btn btn-primary btn-lg" onClick={connect} disabled={busy}>{busy && <Spinner />}{busy ? t("Check your wallet…") : known ? t("Continue as {name}", { name: known }) : t("Connect wallet on {network}", { network: t(NETWORK_INFO[network].label).toLowerCase() })}</button>
          {known && !busy && <p className="fine"><button type="button" className="link-btn" onClick={useAnotherWallet}>{t("Use a different wallet")}</button></p>}
          {stuck && <p className="fine">Wallet didn&apos;t open, or you came back without finishing? <button type="button" className="link-btn" onClick={() => { setBusy(false); setError(""); }}>Tap here to try again</button>.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {emailSignInAvailable && (
            <form className="trade-email" onSubmit={emailStep}>
              <span className="trade-label">{t("Or use your email")}</span>
              <input className="input" type="email" autoComplete="email" inputMode="email" placeholder={t("you@example.com")} value={email} onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setCode(""); }} required disabled={busy} aria-label={t("Your email")} />
              {codeSent && <input className="input" inputMode="numeric" autoComplete="one-time-code" placeholder={t("Code from your email")} value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} aria-label={t("Code from your email")} />}
              <button className="btn btn-ghost btn-lg" disabled={busy || !email.trim() || (codeSent && !code.trim())}>{busy && <Spinner />}{codeSent ? t("Sign in") : t("Email me a code")}</button>
            </form>
          )}
          <p className="fine">{emailSignInAvailable ? t("Use any NEAR wallet, including HOT, Meteor, Intear, MyNearWallet and Nightly, or your email.") : t("No email. No password. You can use any NEAR wallet, including HOT, Meteor, Intear, MyNearWallet and Nightly.")}</p>
        </div>
      </div>
    </div>
  );
}

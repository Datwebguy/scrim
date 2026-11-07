"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { emailSignInAvailable, finishGoogleSignIn, googleSignInAvailable, sendEmailCode, signInWithEmail, startGoogleSignIn, takeGoogleReturn } from "@/client/email";
import { connectedAccount, disconnectWallet, signInWithWallet } from "@/client/wallet";
import { isNetwork, NETWORK_INFO, type Network } from "@/protocol/networks";
import { Spinner } from "./ui";
import { Wordmark } from "@/components/Wordmark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageMenu } from "@/i18n/I18n";
import { useT } from "@/i18n/I18n";

const KEY = "scrim:network";

const line = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
const WalletIcon = () => <svg {...line}><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" /><path d="M4 7.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 1 4 7.5Z" /><path d="M16 13.5h.01" /></svg>;
const MailIcon = () => <svg {...line}><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4.5 8 7.5 5.5L19.5 8" /></svg>;
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.5 12.27c0-.8-.07-1.56-.2-2.3H12v4.35h5.9a5.05 5.05 0 0 1-2.19 3.31v2.75h3.55c2.08-1.91 3.28-4.73 3.28-8.11Z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.67l-3.55-2.75c-.98.66-2.24 1.05-3.73 1.05-2.87 0-5.3-1.94-6.17-4.55H2.17v2.84A11 11 0 0 0 12 23Z" />
    <path fill="#FBBC05" d="M5.83 14.08a6.6 6.6 0 0 1 0-4.16V7.08H2.17a11 11 0 0 0 0 9.84l3.66-2.84Z" />
    <path fill="#EA4335" d="M12 5.37c1.62 0 3.07.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.17 7.08l3.66 2.84C6.7 7.31 9.13 5.37 12 5.37Z" />
  </svg>
);

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

  // Back from Google: finish the sign in with the code in the address.
  useEffect(() => {
    if (!googleSignInAvailable) return;
    const back = takeGoogleReturn();
    if (!back) return;
    setBusy(true);
    finishGoogleSignIn(back.code, back.state, back.network ?? network).then(
      () => { router.replace("/app"); router.refresh(); },
      (e) => { setError(e instanceof Error ? e.message : t("Sign-in didn't finish. Try again.")); setBusy(false); },
    );
    // Runs once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function google() {
    setBusy(true);
    setError("");
    try {
      try { localStorage.setItem(KEY, network); } catch { /* optional */ }
      await startGoogleSignIn(network);
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
          <h1>{emailSignInAvailable ? t("Sign in") : t("Sign in with your wallet")}</h1>
          <p>{emailSignInAvailable ? t("Use a NEAR wallet, Google or your email. Signing in can't move any money.") : t("Choose your NEAR wallet and approve one message. It proves the account is yours. It can't move any money.")}</p>

          {networks.length > 1 && (
            <div className="net">
              <div className="net-toggle" role="radiogroup" aria-label={t("Network")}>
                {networks.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={network === n} onClick={() => setNetwork(n)}>{t(NETWORK_INFO[n].label)}</button>
                ))}
              </div>
              <span>{t(network === "mainnet" ? "Real money. Everything works." : "Practice with free test coins.")}</span>
            </div>
          )}

          {network === "testnet" && <div className="notice info">{t("Testnet uses free test coins, so nothing here is worth money.")}</div>}
          <div className="method">
            <button className="btn btn-primary btn-lg method-main" onClick={connect} disabled={busy}>
              {busy ? <Spinner /> : <WalletIcon />}
              {busy ? t("Check your wallet…") : known ? t("Continue as {name}", { name: known }) : t("Connect wallet on {network}", { network: t(NETWORK_INFO[network].label).toLowerCase() })}
            </button>
            <small>{t("HOT, Meteor, Intear, MyNearWallet, Nightly and more")}</small>
          </div>
          {known && !busy && <p className="fine plain"><button type="button" className="link-btn" onClick={useAnotherWallet}>{t("Use a different wallet")}</button></p>}
          {stuck && <p className="fine">Wallet didn&apos;t open, or you came back without finishing? <button type="button" className="link-btn" onClick={() => { setBusy(false); setError(""); }}>Tap here to try again</button>.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          {emailSignInAvailable && (
            <form className="trade-email" onSubmit={emailStep}>
              <span className="trade-or"><i />{t("Or sign in without a wallet")}<i /></span>
              {googleSignInAvailable && <button type="button" className="btn btn-ghost btn-lg method-google" onClick={google} disabled={busy}>{busy ? <Spinner /> : <GoogleIcon />}{t("Continue with Google")}</button>}
              <label className="email-field">
                <MailIcon />
                <input className="input" type="email" autoComplete="email" inputMode="email" placeholder={t("you@example.com")} value={email} onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setCode(""); }} required disabled={busy} aria-label={t("Your email")} />
              </label>
              {codeSent && <input className="input code-field" inputMode="numeric" autoComplete="one-time-code" placeholder={t("Code from your email")} value={code} onChange={(e) => setCode(e.target.value)} required disabled={busy} aria-label={t("Code from your email")} />}
              <button className="btn btn-ghost btn-lg" disabled={busy || !email.trim() || (codeSent && !code.trim())}>{busy && <Spinner />}{codeSent ? t("Sign in") : t("Email me a code")}</button>
            </form>
          )}
          <p className="fine">{emailSignInAvailable ? t("Email and Google create a wallet for you. No wallet app needed.") : t("No email. No password. You can use any NEAR wallet, including HOT, Meteor, Intear, MyNearWallet and Nightly.")}</p>
        </div>
      </div>
    </div>
  );
}

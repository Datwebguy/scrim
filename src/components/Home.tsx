"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { turnOnPrivateMode, unlockPrivateBalance } from "@/client/wallet";
import { NotSwitchedOn } from "./Gates";
import { fmt, Heading, KIND_LABEL, StateChip, TokenLogo, usd, type TransferView } from "./money";
import { useSession, useSwitchNetwork } from "./session";
import { Spinner, useToast } from "./ui";

// The one-time registration costs a tiny network fee, but wallets want some headroom in the account.
const SETUP_MIN_NEAR = 110n * 10n ** 21n; // 0.11 NEAR

type Holding = { assetId: string; symbol: string; chainName: string; display: string; usd: number | null; icon: string | null; chainIcon: string | null };
type Overview = { status: string; detail: string | null; publicKey: string | null; totalUsd: number; holdings: Holding[] };

export function Home() {
  const { accountId, network, otherNetworks } = useSession();
  const switchNetwork = useSwitchNetwork();
  const toast = useToast();
  const router = useRouter();
  const { data, loading, reload } = useApi<Overview>("/private", { every: 30_000 });
  const { data: tx } = useApi<{ transfers: TransferView[] }>("/transfers", { every: 15_000 });
  const [view, setView] = useState<"you" | "public">("you");
  const [busy, setBusy] = useState(false);
  const needsSetup = data?.status === "needs_setup";
  const { data: wallet, reload: recheck } = useApi<{ holdings: { id: string; amount: string; display: string }[] }>(needsSetup ? "/wallet" : null, { every: 15_000 });
  const near = wallet?.holdings.find((h) => h.id === "near");
  const nativeBalance = near ? BigInt(near.amount) : null;
  const tooLow = nativeBalance !== null && nativeBalance < SETUP_MIN_NEAR;
  const [setupError, setSetupError] = useState("");
  const [checking, setChecking] = useState(false);

  async function unlock(setup = false) {
    setBusy(true);
    setSetupError("");
    try {
      if (setup) {
        // Check again first: an earlier attempt may have registered the wallet even if the page didn't hear back.
        const fresh = await api<Overview>("/private");
        if (fresh.status === "needs_setup" && fresh.publicKey) await turnOnPrivateMode(network, fresh.publicKey);
      }
      await unlockPrivateBalance(network, accountId);
      toast("Private balance unlocked");
      await reload();
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "";
      const friendly = /enough balance/i.test(message)
        ? "Your wallet needs a little more NEAR for the network fee. Add some, then tap Try again."
        : /reject|cancel|denied|declin/i.test(message)
          ? "You cancelled it in your wallet. Tap Try again when you're ready."
          : message || "That didn't go through. Tap Try again.";
      if (setup) setSetupError(friendly);
      else toast(friendly, "error");
      if (setup) void recheck();
    } finally {
      setBusy(false);
    }
  }

  async function checkAgain() {
    setChecking(true);
    try {
      await Promise.all([recheck(), reload()]);
    } finally {
      setChecking(false);
    }
  }

  const recent = (tx?.transfers ?? []).filter((t) => !["cancelled", "expired"].includes(t.status)).slice(0, 5);
  const active = data?.status === "active";

  return (
    <>
      <Heading eyebrow="Home" title="Your private money" />
      <NotSwitchedOn />

      {loading && !data && <div className="skeleton" />}

      {data && data.status !== "active" && (
        <div className="card card-pad gate-card">
          {data.status === "needs_setup" ? (
            <>
              <h2>One quick step to turn on private mode</h2>
              <p className="muted">Your wallet is registered once so it can hold private money. You approve one transaction in your wallet. The small fee goes to the NEAR network, not to Scrim, and you only pay it this once.</p>
              {near && <p className="muted">{accountId} has <b>{near.display} NEAR</b>.</p>}
              {tooLow && (
                <div className="notice info">
                  <b>Add a little NEAR first.</b> This account needs about 0.1 NEAR in it to cover the network fee. The fee itself is under 0.01 NEAR. Send some NEAR to {accountId} from an exchange or another wallet. This page updates by itself, or tap Check again.
                </div>
              )}
              {setupError && <p className="form-error" role="alert">{setupError}</p>}
              <div className="gate-actions">
                <button className="btn btn-signal btn-lg" onClick={() => unlock(true)} disabled={busy}>{busy && <Spinner />} {setupError ? "Try again" : tooLow ? "Try anyway" : "Turn on private mode"}</button>
                <button className="btn btn-ghost btn-lg" onClick={checkAgain} disabled={busy || checking}>{checking && <Spinner />} Check again</button>
              </div>
            </>
          ) : data.status === "unavailable" ? (
            <>
              <h2>Private mode isn't available right now</h2>
              <p className="muted">{data.detail ?? "We couldn't reach the private network. Your money is safe. Try again in a moment."}</p>
              <button className="btn btn-primary" onClick={() => unlock()} disabled={busy}>{busy && <Spinner />} Try again</button>
            </>
          ) : (
            <>
              <h2>Unlock your private balance</h2>
              <p className="muted">Approve one message in your wallet. It proves it's you and can't move any money.</p>
              <button className="btn btn-signal btn-lg" onClick={() => unlock()} disabled={busy}>{busy && <Spinner />} Unlock</button>
            </>
          )}
        {otherNetworks.includes("testnet") && (
            <p className="fine">Want to practice first with free test coins? <button type="button" className="link-btn" onClick={() => switchNetwork("testnet")}>Use testnet instead</button></p>
          )}
        </div>
      )}

      {active && data && (
        <>
          <section className="balance-hero" aria-label="Private balance">
            <div className="balance-tabs" role="tablist">
              <button role="tab" aria-selected={view === "you"} onClick={() => setView("you")}>What you see</button>
              <button role="tab" aria-selected={view === "public"} onClick={() => setView("public")}>What the public sees</button>
            </div>
            {view === "you" ? (
              <div>
                <span className="muted-on-dark">Private balance</span>
                <strong className="balance-figure">{usd(data.totalUsd)}</strong>
                <span className="muted-on-dark">Only you can see this.</span>
              </div>
            ) : (
              <div>
                <span className="muted-on-dark">Anyone looking at the blockchain</span>
                <strong className="balance-figure faint">Nothing</strong>
                <span className="muted-on-dark">No balance. No payments. No link between what you add and what you send.</span>
              </div>
            )}
            <div className="quick">
              <Link href="/app/add" className="btn btn-signal">Add money</Link>
              <Link href="/app/send" className="btn btn-light">Send</Link>
              <Link href="/app/swap" className="btn btn-light">Swap</Link>
              <Link href="/app/requests" className="btn btn-light">Get paid</Link>
            </div>
          </section>

          <div className="two-col">
            <section className="card">
              <div className="card-title"><h3>What you hold</h3></div>
              {data.holdings.length === 0 ? (
                <div className="empty small"><h3>Nothing here yet</h3><p>Add money from any chain and it will show up here, privately.</p><Link href="/app/add" className="btn btn-primary">Add money</Link></div>
              ) : (
                <ul className="rows">
                  {data.holdings.map((h) => (
                    <li key={h.assetId}>
                      <TokenLogo icon={h.icon} symbol={h.symbol} chainIcon={h.chainIcon} />
                      <span><b>{h.symbol}</b><small>{h.chainName}</small></span>
                      <span className="right"><b>{h.display}</b>{h.usd !== null && <small>{usd(h.usd)}</small>}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card">
              <div className="card-title"><h3>Recent activity</h3><Link href="/app/activity" className="muted">See all</Link></div>
              {recent.length === 0 ? (
                <div className="empty small"><p>Nothing yet. What you do here will show up in this list, and only you can see it.</p></div>
              ) : (
                <ul className="rows">
                  {recent.map((t) => (
                    <li key={t.id}>
                      <span className="coin dark">{t.kind === "send" || t.kind === "withdraw" ? "↗" : t.kind === "swap" ? "⇄" : "↓"}</span>
                      <span><b>{KIND_LABEL[t.kind] ?? t.kind}</b><small>{fmt(t.amountOut, t.toAsset.decimals)} {t.toAsset.symbol}</small></span>
                      <span className="right"><StateChip status={t.status} /></span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  );
}

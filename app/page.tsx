import Link from "next/link";
import { catalog } from "@/server/assets";
import { FlowDemo } from "@/components/landing/FlowDemo";
import { HeroCard, PaidScene, ProofScene, SendScene, SwapScene, TeamScene } from "@/components/landing/Scenes";
import { Reveal } from "@/components/landing/Reveal";

export const revalidate = 300;

const REPO = "https://github.com/Datwebguy/scrim";

export default async function Home() {
  const live = await liveNetworks();
  const icons = (live?.chains ?? []).filter((c) => c.icon).slice(0, 12);
  const coins = live?.coins ?? [];
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand" aria-label="Scrim home"><img src="/scrim-mark.png" alt="" />scrim</Link>
        <nav aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#teams">Teams</a>
          <a href="#proofs">Proofs</a>
          <a href="#questions">FAQ</a>
        </nav>
        <Link href="/app" className="btn btn-primary">Open app <span className="arrow">↗</span></Link>
      </header>

      <main>
        <section className="l-hero">
          <div className="l-bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /><span className="grid" /></div>
          <div className="wrap l-hero-grid">
            <Reveal>
              <span className="eyebrow">Private money on NEAR</span>
              <h1>Move money.<br /><em>Keep it private.</em></h1>
              <p className="lead">Hold, send, swap and get paid. Only you see it.</p>
              <div className="hero-actions">
                <Link href="/app" className="btn btn-signal btn-lg">Get started <span className="arrow">→</span></Link>
                <a href="#how" className="btn btn-ghost btn-lg">See how</a>
              </div>
            </Reveal>
            <Reveal delay={120}><HeroCard coins={coins} /></Reveal>
          </div>
        </section>

        {live && (
          <section className="l-marquee" aria-label={`${live.assets} coins on ${live.chains.length} networks`}>
            <div className="l-marquee-track">
              {[...live.chains, ...live.chains].map((c, i) => (
                <span key={i} aria-hidden={i >= live.chains.length}>
                  {c.icon ? <img src={c.icon} alt="" width={22} height={22} loading="lazy" referrerPolicy="no-referrer" /> : <i />}
                  {c.name}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="section" id="how">
          <div className="wrap">
            <Reveal className="l-head center"><span className="eyebrow">How it moves</span><h2>One balance. Every move private.</h2></Reveal>
            <Reveal><div className="l-demo-wrap"><FlowDemo icons={icons} /></div></Reveal>
          </div>
        </section>

        <section className="section l-story" id="features">
          <div className="wrap">
            <Row eyebrow="Send" title="Pay anyone, on any chain." text="Nobody can trace it back to you."><SendScene nets={icons} /></Row>
            <Row eyebrow="Swap" title="Swap without an audience." text="Trade inside your private balance." flip><SwapScene coins={coins} /></Row>
            <Row eyebrow="Get paid" title="Share a link. Get paid." text="They pay from any coin. No account needed."><PaidScene nets={icons} /></Row>
          </div>
        </section>

        <section className="section dark-section" id="teams">
          <div className="wrap">
            <Reveal className="l-head"><span className="eyebrow">For teams</span><h2>Private to the market. Clear to your accountant.</h2></Reveal>
            <Reveal><TeamScene /></Reveal>
          </div>
        </section>

        <section className="section" id="proofs">
          <div className="wrap l-proof">
            <Reveal>
              <span className="eyebrow">Proofs</span>
              <h2>Show one fact.<br />Keep the rest.</h2>
              <p className="lead">Made for one reader. Expires. Revocable.</p>
              <Link href="/verify" className="btn btn-primary">Check a proof</Link>
            </Reveal>
            <Reveal delay={120}><ProofScene /></Reveal>
          </div>
        </section>

        <section className="section" id="questions" style={{ paddingTop: 0 }}>
          <div className="wrap faq-wrap">
            <div><span className="eyebrow">FAQ</span><h2>Quick answers.</h2></div>
            <div className="faq">
              <details open><summary>Is it really private?</summary><p>Your money sits on NEAR Intents&apos; private ledger, not the public chain.</p></details>
              <details><summary>Does Scrim hold my money?</summary><p>No. Only your wallet can move it.</p></details>
              <details><summary>Can I try it free?</summary><p>Yes, on testnet. Private money runs on mainnet only.</p></details>
              <details><summary>What does it cost?</summary><p>Free to open. Network fees are shown before you confirm.</p></details>
            </div>
          </div>
        </section>

        <section className="closing">
          <Reveal className="wrap">
            <h2>Your money. Your business.</h2>
            <Link href="/app" className="btn btn-signal btn-lg">Get started <span className="arrow">→</span></Link>
          </Reveal>
        </section>
      </main>

      <footer className="l-footer">
        <div className="wrap">
          <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" />scrim</Link>
          <nav aria-label="Footer">
            <Link href="/app">App</Link>
            <Link href="/verify">Check a proof</Link>
            <a href={REPO}>GitHub</a>
          </nav>
          <span className="l-built">Built on NEAR</span>
        </div>
      </footer>
    </>
  );
}


function Row({ eyebrow, title, text, flip, children }: { eyebrow: string; title: string; text: string; flip?: boolean; children: React.ReactNode }) {
  return (
    <div className={`l-row ${flip ? "flip" : ""}`}>
      <Reveal><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p className="lead">{text}</p></Reveal>
      <Reveal delay={120}>{children}</Reveal>
    </div>
  );
}

type Live = { assets: number; chains: { name: string; icon: string | null }[]; coins: { symbol: string; icon: string | null }[] } | null;

// Coins shown in the animations: the most widely supported ones in the live list, with a logo.
function topCoins(assets: { symbol: string; icon: string | null }[]) {
  const counts = new Map<string, { symbol: string; icon: string | null; n: number }>();
  for (const a of assets) {
    if (!a.icon) continue;
    const c = counts.get(a.symbol) ?? { symbol: a.symbol, icon: a.icon, n: 0 };
    c.n += 1;
    counts.set(a.symbol, c);
  }
  return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6).map(({ symbol, icon }) => ({ symbol, icon }));
}

// Real, current data from NEAR Intents and CoinGecko: how many coins and chains Scrim can move between.
async function liveNetworks(): Promise<Live> {
  try {
    const assets = await catalog();
    const byChain = new Map<string, { name: string; icon: string | null; count: number }>();
    for (const a of assets) {
      const c = byChain.get(a.chain) ?? { name: a.chainName, icon: a.chainIcon, count: 0 };
      c.count += 1;
      byChain.set(a.chain, c);
    }
    const chains = [...byChain.values()].sort((a, b) => b.count - a.count);
    return { assets: assets.length, chains, coins: topCoins(assets) };
  } catch {
    return null;
  }
}

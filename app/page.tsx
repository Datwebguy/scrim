import Link from "next/link";
import { catalog } from "@/server/assets";
import { FlowDemo } from "@/components/landing/FlowDemo";
import { Reveal } from "@/components/landing/Reveal";

export const revalidate = 300;

const REPO = "https://github.com/Datwebguy/scrim";

export default async function Home() {
  const live = await liveNetworks();
  const icons = (live?.chains ?? []).filter((c) => c.icon).slice(0, 12);
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand" aria-label="Scrim home"><img src="/scrim-mark.png" alt="" />scrim</Link>
        <nav aria-label="Primary">
          <a href="#features">Features</a>
          <a href="#teams">Teams</a>
          <a href="#proofs">Proofs</a>
          <a href="#questions">FAQ</a>
        </nav>
        <Link href="/app" className="btn btn-primary">Open app <span className="arrow">↗</span></Link>
      </header>

      <main>
        <section className="l-hero">
          <div className="wrap l-hero-grid">
            <Reveal>
              <span className="eyebrow">Private money on NEAR</span>
              <h1>Move money.<br /><em>Keep it private.</em></h1>
              <p className="lead">Hold, send, swap and get paid. Only you see it.</p>
              <div className="hero-actions">
                <Link href="/app" className="btn btn-signal btn-lg">Get started <span className="arrow">→</span></Link>
                <a href="#features" className="btn btn-ghost btn-lg">See how</a>
              </div>
            </Reveal>
            <Reveal delay={120}><FlowDemo icons={icons} /></Reveal>
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

        <section className="section" id="features">
          <div className="wrap">
            <Reveal className="l-head"><span className="eyebrow">Features</span><h2>Everything money does. Without the audience.</h2></Reveal>
            <div className="l-tiles">
              {FEATURES.map((f, i) => (
                <Reveal key={f.title} delay={i * 60}>
                  <article className="l-tile"><span className="l-ico">{f.icon}</span><h3>{f.title}</h3><p>{f.text}</p></article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="section dark-section" id="teams">
          <div className="wrap">
            <Reveal className="l-head"><span className="eyebrow">For teams</span><h2>Private to the market. Clear to your accountant.</h2></Reveal>
            <ol className="l-pipe">
              {["Request", "Limits check", "Approvals", "Paid & recorded"].map((step, i) => (
                <li key={step} style={{ animationDelay: `${i * 0.6}s` }}><i>{i + 1}</i><b>{step}</b></li>
              ))}
            </ol>
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
            <Reveal delay={120}>
              <div className="l-proof-card">
                <div className="ok"><span>✓</span>Made for one named reader</div>
                <div className="ok"><span>✓</span>Holds at least an amount</div>
                <div className="ok"><span>✓</span>Valid for 1, 7 or 30 days</div>
                <div className="no"><span>✕</span>Balance and history stay hidden</div>
              </div>
            </Reveal>
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

const FEATURES = [
  { icon: "↓", title: "Add", text: "From 30+ networks." },
  { icon: "↗", title: "Send", text: "To anyone, any chain." },
  { icon: "⇄", title: "Swap", text: "Inside your balance." },
  { icon: "¤", title: "Get paid", text: "Share a link." },
  { icon: "◇", title: "Prove", text: "One fact, one reader." },
  { icon: "☰", title: "Teams", text: "Approvals and limits." },
];

type Live = { assets: number; chains: { name: string; icon: string | null }[] } | null;

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
    return { assets: assets.length, chains };
  } catch {
    return null;
  }
}

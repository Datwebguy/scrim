import Link from "next/link";
import { catalog } from "@/server/assets";
import { FlowDemo } from "@/components/landing/FlowDemo";
import { AskScene, HeroCard, PaidScene, ProofScene, SendScene, SwapScene, TeamScene, AgentScene, X402Scene } from "@/components/landing/Scenes";
import { Orbit } from "@/components/landing/Orbit";
import { Reveal } from "@/components/landing/Reveal";
import { TaglineReveal } from "@/components/landing/TaglineReveal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageMenu } from "@/i18n/I18n";
import { getT } from "@/i18n/server";
import { Wordmark } from "@/components/Wordmark";

export const revalidate = 300;

const REPO = "https://github.com/Datwebguy/scrim";

export default async function Home() {
  const t = await getT();
  const live = await liveNetworks();
  const icons = (live?.chains ?? []).filter((c) => c.icon).slice(0, 12);
  const coins = live?.coins ?? [];
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand" aria-label="Scrim home"><img src="/scrim-mark.png" alt="" /><Wordmark /></Link>
        <nav aria-label="Primary">
          <a href="#how">{t("How it works")}</a>
          <a href="#features">{t("Features")}</a>
          <a href="#accounts">{t("Accounts")}</a>
          <a href="#agents">{t("Agents")}</a>
          <a href="#ask">{t("Ask")}</a>
          <a href="#proofs">{t("Proofs")}</a>
          <a href="#questions">{t("FAQ")}</a>
        </nav>
        <span className="nav-actions"><LanguageMenu /><ThemeToggle /><Link href="/app" className="btn btn-primary">{t("Open app")} <span className="arrow">↗</span></Link></span>
      </header>

      <main>
        <section className="l-hero">
          <div className="l-bg" aria-hidden="true"><span className="orb o1" /><span className="orb o2" /><span className="orb o3" /></div>
          <div className="wrap l-hero-grid">
            <Reveal>
              <span className="eyebrow">{t("Money on NEAR")}</span>
              <h1>{t("Move money.")}<br /><em>{t("Private when you want it.")}</em></h1>
              <p className="lead">{t("Hold, send, swap and get paid. Public or private, your choice.")}</p>
              <div className="hero-actions">
                <Link href="/app" className="btn btn-signal btn-lg">{t("Get started")} <span className="arrow">→</span></Link>
                <a href="#how" className="btn btn-ghost btn-lg">{t("See how")}</a>
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
            <Reveal className="l-head center"><span className="eyebrow">{t("How it moves")}</span><h2>{t("One balance. Private when you choose.")}</h2></Reveal>
            <Reveal><div className="l-demo-wrap"><FlowDemo icons={icons} /></div></Reveal>
          </div>
        </section>

        <section className="section l-story" id="features">
          <div className="wrap">
            <Row eyebrow="Send" title="Pay anyone, on any chain." text="Choose private and it can't be traced back to you."><SendScene nets={icons} /></Row>
            <Row eyebrow="Swap" title="Swap your way." text="Trade in public or inside your private balance." flip><SwapScene coins={coins} /></Row>
            <Row eyebrow="Get paid" title="Share a link. Get paid." text="They pay from any coin. No account needed."><PaidScene nets={icons} /></Row>
          </div>
        </section>

        <section className="section dark-section" id="accounts">
          <div className="wrap">
            <Reveal className="l-head"><span className="eyebrow">{t("Rules for your money")}</span><h2>{t("Clear to you. Private if you like.")}</h2></Reveal>
            <Reveal><TeamScene /></Reveal>
          </div>
        </section>

        <section className="section l-story" id="agents">
          <div className="wrap">
            <Row eyebrow="Agents" title="Let your agents pay. Within limits you set." text="Each agent gets its own key. You set what it may spend per payment and over time, and who it may pay. Inside those limits it pays, by itself or with your approval. Above them, it waits for you." flip><AgentScene /></Row>
            <Row eyebrow="x402" title="Pay for APIs. Get paid by agents." text="Agents find paid APIs and data, and pay them on Base, Solana and six more chains, within your limits. Choose private or public for each agent wallet. And you can sell to agents too: a file, a report or your API, paid into your private balance or your wallet."><X402Scene /></Row>
          </div>
        </section>

        <section className="section l-story" id="ask">
          <div className="wrap">
            <Row eyebrow="Ask" title="Ask your money. Keep it between you and the AI." text="Ask about your payments in plain words. AI answers inside NEAR AI's secure hardware, and every answer is signed and checked. Scrim keeps no copy." flip><AskScene /></Row>
          </div>
        </section>

        <section className="section" id="proofs">
          <div className="wrap l-proof">
            <Reveal>
              <span className="eyebrow">{t("Proofs")}</span>
              <h2>Show one fact.<br />{t("Keep the rest.")}</h2>
              <p className="lead">{t("Made for one reader. Expires. Revocable.")}</p>
              <Link href="/verify" className="btn btn-primary">{t("Check a proof")}</Link>
            </Reveal>
            <Reveal delay={120}><ProofScene /></Reveal>
          </div>
        </section>

        <section className="section" id="questions" style={{ paddingTop: 0 }}>
          <div className="wrap faq-wrap">
            <div><span className="eyebrow">{t("FAQ")}</span><h2>{t("Quick answers.")}</h2></div>
            <div className="faq">
              <details open><summary>{t("Can I keep things private?")}</summary><p>{t("Yes. Choose private for any payment and it stays off the public chain. Choose public when you want it on the chain.")}</p></details>
              <details><summary>{t("Does Scrim hold my money?")}</summary><p>{t("No. Only your wallet can move it.")}</p></details>
              <details><summary>{t("Can I try it free?")}</summary><p>{t("Yes, on testnet. Private options need mainnet; testnet is public.")}</p></details>
              <details><summary>{t("Can AI agents use it?")}</summary><p>{t("Yes. Each agent gets its own key and limits. You approve what it asks to pay, or let it pay by itself from its own wallet. Agents can also pay for APIs and pay your links over x402.")}</p></details>
              <details><summary>{t("Is the AI private?")}</summary><p>Yes. Ask runs on NEAR AI Cloud&apos;s confidential hardware. Scrim checks each answer&apos;s signature against that hardware&apos;s attestation, and stores neither your question nor the answer.</p></details>
              <details><summary>{t("What does it cost?")}</summary><p>{t("Free to open. Network fees are shown before you confirm.")}</p></details>
            </div>
          </div>
        </section>

        <section className="closing">
          <Reveal className="wrap">
            <h2>{t("Your money. Your business.")}</h2>
            <Link href="/app" className="btn btn-signal btn-lg">Get started <span className="arrow">→</span></Link>
          </Reveal>
        </section>
      </main>

      <footer className="l-footer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="l-foot-engraving" src="/brand/flammarion.webp" alt="" loading="lazy" />
        <div className="wrap l-foot-top">
          <div>
            <TaglineReveal lines={["Money on NEAR,", "private when you want it."]} />
            <p className="l-foot-sub">Send, swap and get paid on {live ? `${live.chains.length} chains` : "any chain"}. Approvals and limits for accounts. Agents that pay within your rules.</p>
          </div>
          <Orbit chains={live?.chains ?? []} />
        </div>
        <div className="wrap l-foot-row">
          <Link href="/" className="brand" aria-label="Scrim home"><Wordmark /></Link>
          <nav aria-label="Footer">
            <Link href="/app">{t("App")}</Link>
            <Link href="/verify">{t("Check a proof")}</Link>
            <Link href="/roadmap">{t("Roadmap")}</Link>
            <Link href="/whitepaper">{t("Whitepaper")}</Link>
            <a href={REPO}>{t("GitHub")}</a>
          </nav>
          <span className="l-built">{t("Built on NEAR")}</span>
        </div>
        <div className="l-foot-giant" aria-hidden="true"><Wordmark /></div>
      </footer>
    </>
  );
}


async function Row({ eyebrow, title, text, flip, children }: { eyebrow: string; title: string; text: string; flip?: boolean; children: React.ReactNode }) {
  const t = await getT();
  return (
    <div className={`l-row ${flip ? "flip" : ""}`}>
      <Reveal><span className="eyebrow">{t(eyebrow)}</span><h2>{t(title)}</h2><p className="lead">{t(text)}</p></Reveal>
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

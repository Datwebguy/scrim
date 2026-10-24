import Link from "next/link";
import { catalog } from "@/server/assets";

export const revalidate = 300;

const REPO = "https://github.com/Datwebguy/scrim";

export default async function Home() {
  const live = await liveNetworks();
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand" aria-label="Scrim home"><img src="/scrim-mark.png" alt="" />scrim</Link>
        <nav aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#features">What you can do</a>
          <a href="#proofs">Proofs</a>
          <a href="#questions">Questions</a>
        </nav>
        <Link href="/app" className="btn btn-primary">Open your account <span className="arrow">↗</span></Link>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow">Private money on NEAR</span>
              <h1>Move money.<br /><em>Keep it private.</em></h1>
              <p className="lead">
                Scrim gives you a private balance. Add money from any chain, pay anyone, get paid with a link, and show one fact to one person when they need to know. Nobody else sees the rest.
              </p>
              <div className="hero-actions">
                <Link href="/app" className="btn btn-signal btn-lg">Open your account <span className="arrow">→</span></Link>
                <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
              </div>
              <div className="hero-proof">
                <span>No email or password</span>
                <span>Works with any NEAR wallet</span>
                <span>Your keys stay with you</span>
              </div>
            </div>
            <SideBySide />
          </div>
        </section>

        <section className="strip" aria-label="Why Scrim">
          <div className="wrap">
            <div><b>Only you see your balance</b><span>Not the public. Not other users.</span></div>
            <div><b>Add money from anywhere</b><span>Bitcoin, Ethereum, Solana, Base and more.</span></div>
            <div><b>Get paid with a link</b><span>The payer needs no account.</span></div>
            <div><b>Prove only what's needed</b><span>One fact, one person, with an expiry.</span></div>
          </div>
        </section>

        {live && (
          <section className="chains" aria-label="Supported networks">
            <div className="wrap">
              <p><b>{live.assets} coins on {live.chains.length} networks</b>, live from NEAR Intents.</p>
              <ul>
                {live.chains.map((c) => (
                  <li key={c.name} title={c.name}>
                    {c.icon ? <img src={c.icon} alt="" width={20} height={20} loading="lazy" referrerPolicy="no-referrer" /> : <span className="dot" />}
                    {c.name}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <div><span className="eyebrow">How it works</span><h2>Four steps. Nothing to learn first.</h2></div>
              <p>Everyone can see what happens on a public blockchain: who paid whom, and how much. Scrim moves your money through a private layer, so what you do stays yours.</p>
            </div>
            <div className="steps">
              <article className="step"><span className="n">1 · CONNECT</span><h3>Sign in with your wallet</h3><p>Pick your NEAR wallet and approve one message. No email, no password, no ID check.</p></article>
              <article className="step"><span className="n">2 · ADD</span><h3>Bring money in</h3><p>Choose a coin and a network. Send to the one-time address we show you. It lands in your private balance.</p><span className="tag">30+ networks</span></article>
              <article className="step"><span className="n">3 · USE</span><h3>Send, swap, get paid</h3><p>Pay a person or any address on any chain. Swap one coin for another. Share a link to be paid.</p></article>
              <article className="step"><span className="n">4 · PROVE</span><h3>Show a fact when asked</h3><p>Give a bank, landlord or client a proof made just for them. It expires, and you can take it back.</p></article>
            </div>
          </div>
        </section>

        <section className="section features" id="features" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head">
              <div><span className="eyebrow">What you can do</span><h2>Everything money does, without the audience.</h2></div>
              <p>One account for holding, paying and getting paid, whether you are one person, a team, or a business.</p>
            </div>
            <div className="feature-grid">
              <article className="card"><span className="ficon">↓</span><h3>Add money</h3><p>Deposit from Bitcoin, Ethereum, Solana, Base, Tron, TON and more than 30 other networks. No bridge to figure out.</p></article>
              <article className="card"><span className="ficon">↗</span><h3>Send privately</h3><p>Pay another Scrim user, or any wallet or exchange address on any chain. The payment can't be traced to your balance.</p></article>
              <article className="card"><span className="ficon">⇄</span><h3>Swap</h3><p>Trade one coin for another inside your private balance. Nobody sees what you swapped.</p></article>
              <article className="card"><span className="ficon">¤</span><h3>Get paid by link</h3><p>Share a link. Your client pays from whichever coin they have, with no account. You see it arrive.</p></article>
              <article className="card"><span className="ficon">◇</span><h3>Prove it</h3><p>Show you hold at least an amount, or that a payment was made. Made for one reader, valid for 1, 7 or 30 days.</p></article>
              <article className="card"><span className="ficon">☰</span><h3>Run it as a team</h3><p>Choose who must approve each payment, set spending limits, and keep a clean record for your accountant.</p></article>
            </div>
          </div>
        </section>

        <section className="section dark-section" id="teams">
          <div className="wrap dark-grid">
            <div>
              <span className="eyebrow">For businesses and teams</span>
              <h2>Private from the market. Clear to your auditors.</h2>
              <p className="lead">Pay contractors, suppliers and staff without publishing your payroll. Every payment needs the approvals you choose, and every step is written down.</p>
              <div className="rule-list">
                <div><i>1</i><span>Require two or three people to approve before money moves.</span></div>
                <div><i>2</i><span>Set a limit per payment and per day for each person or program that pays for you.</span></div>
                <div><i>3</i><span>Anything outside the limits is stopped before it reaches the people who approve.</span></div>
                <div><i>4</i><span>Software can ask to pay, but only people can approve. Pause it with one click.</span></div>
              </div>
            </div>
            <ol className="flow" aria-label="How a team payment is approved">
              <li><b>Someone asks to pay</b><span>A person, or software you've given a limit.</span></li>
              <li><b>Your limits check it</b><span>Who it can pay, how much each time, how much each day. Anything outside is stopped here.</span></li>
              <li><b>The right people approve</b><span>Each approves in their own wallet. You choose how many are needed.</span></li>
              <li><b>It's paid, and written down</b><span>From your private balance, with a record for your accountant.</span></li>
            </ol>
          </div>
        </section>

        <section className="proof-band" id="proofs">
          <div className="wrap proof-grid">
            <div className="proof-sample" aria-label="What a proof shows">
              <span className="section-label">What the reader sees</span>
              <dl className="wire">
                <div><dt>Made for</dt><dd>The one person or company you name</dd></div>
                <div><dt>It says</dt><dd>One fact: "holds at least…" or "paid…"</dd></div>
                <div><dt>Valid until</dt><dd>1, 7 or 30 days from today</dd></div>
                <div><dt>Status</dt><dd>Genuine, unchanged, and not taken back</dd></div>
                <div className="never"><dt>Never shown</dt><dd>Your real balance, other payments, or history</dd></div>
              </dl>
            </div>
            <div>
              <span className="eyebrow">Proofs</span>
              <h2>Show one fact.<br />Keep the rest.</h2>
              <p className="lead">A bank asks for proof of funds. A client asks if you paid. Instead of showing your whole account, you send a link. They see the one fact, made for them, until it expires.</p>
              <ul className="plain-list">
                <li>They don't need an account to check it.</li>
                <li>It names who it's for, so it can't pass for someone else's.</li>
                <li>It never shows your real balance, your other payments or your history.</li>
              </ul>
              <Link href="/verify" className="btn btn-primary">Check a proof you received</Link>
            </div>
          </div>
        </section>

        <section className="section" id="questions">
          <div className="wrap faq-wrap">
            <div><span className="eyebrow">Questions</span><h2>Straight answers.</h2></div>
            <div className="faq">
              <details open><summary>Is it really private?</summary><p>Your balance and payments live on a private ledger run by NEAR Intents, not on the public blockchain. The public can't see them, and a deposit can't be matched to a later payment. The people who run that private ledger can see it, in the way a bank can see your account.</p></details>
              <details><summary>Does Scrim hold my money?</summary><p>No. Your money stays in your own private account, and only your wallet can move it. Every payment needs your wallet to approve the exact amount and recipient. We never hold your keys.</p></details>
              <details><summary>What can Scrim see?</summary><p>Enough to show you your own history. We keep a record of what you do, kept scrambled so only your account can read it, and nothing is sold or shared. A payment link shows the payer only what you chose to ask for.</p></details>
              <details><summary>How strong is a proof?</summary><p>Today, Scrim checks your private balance and signs the statement, so the reader trusts Scrim's word and the signature. Proving it on your own device, so even Scrim isn't involved, is the next step. We say this up front because it matters.</p></details>
              <details><summary>What does it cost?</summary><p>Making an account is free. Swaps and payments across chains carry a small network fee, which you see before you confirm anything.</p></details>
              <details><summary>Can I try it without real money?</summary><p>Yes, partly. Sign in on testnet with free test coins to try sign-in, team approvals, spending limits and real NEAR transfers. Private money (adding money, swaps, payment links and proofs) depends on NEAR Intents, which has no testnet, so that part runs on mainnet only. NEAR's own advice is to test it there with a separate account and small amounts.</p></details>
              <details><summary>Is it ready to use?</summary><p>It's new software. Start with small amounts. Everything is open to read on GitHub, and adding and sending money is being switched on in stages.</p></details>
            </div>
          </div>
        </section>

        <section className="closing">
          <div className="wrap">
            <img src="/scrim-mark.png" alt="" />
            <h2>Your money, your business.</h2>
            <p>Open an account with your wallet in under a minute.</p>
            <Link href="/app" className="btn btn-primary btn-lg">Open your account <span className="arrow">↗</span></Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <Link href="/" className="brand" style={{ fontSize: 18 }}><img src="/scrim-mark.png" alt="" style={{ width: 24, height: 24 }} />scrim</Link>
          <span>Private money for people and businesses. Built on NEAR.</span>
          <nav><Link href="/verify">Check a proof</Link><a href={REPO}>GitHub</a><a href={`${REPO}/blob/main/BACKEND_SPEC.md`}>How it's built</a></nav>
        </div>
      </footer>
    </>
  );
}

function SideBySide() {
  return (
    <div className="side-demo" aria-label="What you see compared with what the public sees">
      <div className="sd-card you">
        <span className="section-label">What you see</span>
        <strong className="sd-total">Your balance</strong>
        <ul>
          <li><span>Every payment you sent</span><b>✓</b></li>
          <li><span>Every payment you received</span><b>✓</b></li>
          <li><span>Every swap, with its amounts</span><b>✓</b></li>
        </ul>
      </div>
      <div className="sd-card them">
        <span className="section-label">What the public sees</span>
        <strong className="sd-total">Nothing</strong>
        <p>No balance. No payments. No link between money in and money out.</p>
        <div className="sd-bars" aria-hidden="true"><i /><i /><i /><i /></div>
      </div>
    </div>
  );
}

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

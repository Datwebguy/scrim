import Link from "next/link";

const REPO = "https://github.com/Datwebguy/scrim";

// Static, author-controlled markup for the code sample.
const AGENT_SNIPPET = `<span class="c"># Your agent asks to pay a vendor</span>
curl -X POST $SCRIM_URL/api/v1/agent/payments \\
  -H <span class="s">"Authorization: Bearer $SCRIM_AGENT_KEY"</span> \\
  -H <span class="s">"Idempotency-Key: inv-1048"</span> \\
  -H <span class="s">"Content-Type: application/json"</span> \\
  -d <span class="s">'{"recipient":"0x7a3f…c291","amount":"420.00"}'</span>

<span class="c"># Scrim answers with the policy decision</span>
{
  <span class="k">"status"</span>: <span class="s">"awaiting_approval"</span>,
  <span class="k">"policyDecision"</span>: {
    <span class="k">"allowed"</span>: true,
    <span class="k">"checks"</span>: [
      { "rule": "counterparty",   "passed": true },
      { "rule": "per_action_cap", "passed": true },
      { "rule": "rolling_cap",    "passed": true }
    ]
  },
  <span class="k">"commitment"</span>: <span class="s">"9f2c…e41a"</span>
}`;


export default function Home() {
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand" aria-label="Scrim home">
          <img src="/scrim-mark.png" alt="" />
          scrim
        </Link>
        <nav aria-label="Primary">
          <a href="#how">How it works</a>
          <a href="#agents">Agent API</a>
          <a href="#security">Security</a>
          <a href="#status">Status</a>
        </nav>
        <Link href="/app" className="btn btn-primary">
          Open workspace <span className="arrow">↗</span>
        </Link>
      </header>

      <main>
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <span className="eyebrow">Private treasury on NEAR</span>
              <h1>
                Give agents a budget.
                <br />
                <em>Never your keys.</em>
              </h1>
              <p className="lead">
                Scrim puts every payment through a mandate before it can move. Agents request, the policy engine checks,
                your signers approve from their own wallets, and USDC settles across chains through NEAR Intents.
              </p>
              <div className="hero-actions">
                <Link href="/app" className="btn btn-signal btn-lg">
                  Create a treasury <span className="arrow">→</span>
                </Link>
                <a href="#agents" className="btn btn-ghost btn-lg">
                  See the agent API
                </a>
              </div>
              <div className="hero-proof">
                <span>Wallet-signed approvals</span>
                <span>Versioned spending mandates</span>
                <span>Live Intents quotes</span>
              </div>
            </div>
            <DemoRequest />
          </div>
        </section>

        <section className="strip" aria-label="Principles">
          <div className="wrap">
            <div>
              <b>Keys stay in the wallet</b>
              <span>Scrim only ever sees signatures.</span>
            </div>
            <div>
              <b>Rules before money</b>
              <span>Caps and allowlists are checked server-side.</span>
            </div>
            <div>
              <b>Threshold approvals</b>
              <span>1-of-1 for people, M-of-N for teams.</span>
            </div>
            <div>
              <b>Minimal public trail</b>
              <span>Settlement through NEAR Intents.</span>
            </div>
          </div>
        </section>

        <section className="section" id="how">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="eyebrow">How a payment moves</span>
                <h2>Four gates between a request and a transfer.</h2>
              </div>
              <p>
                Every request, whether a person or an agent created it, carries a commitment that binds the amount,
                recipient, corridor and the exact policy version it was judged against. Nothing downstream can quietly
                change it.
              </p>
            </div>
            <div className="steps">
              <article className="step">
                <span className="n">01 · REQUEST</span>
                <h3>Someone asks to pay</h3>
                <p>A signer in the workspace, or an agent through the API with its own revocable key.</p>
                <span className="tag">POST /api/v1/agent/payments</span>
              </article>
              <article className="step">
                <span className="n">02 · MANDATE</span>
                <h3>The policy engine judges it</h3>
                <p>Approved counterparty, per-action cap, rolling budget, expiry and pause state. Any failure blocks it outright.</p>
                <span className="tag">policy v3 · 5 checks</span>
              </article>
              <article className="step">
                <span className="n">03 · APPROVE</span>
                <h3>Signers sign the exact effect</h3>
                <p>Each approver&apos;s wallet signs a NEP-413 message naming the amount, recipient and request commitment.</p>
                <span className="tag">2 of 3 signatures</span>
              </article>
              <article className="step">
                <span className="n">04 · SETTLE</span>
                <h3>Intents route the outcome</h3>
                <p>An exact-output quote for USDC NEAR → Base: the recipient gets the precise amount and the fee is shown up front.</p>
                <span className="tag">NEAR Intents · ~22s</span>
              </article>
            </div>
          </div>
        </section>

        <section className="section dark-section" id="agents">
          <div className="wrap dark-grid">
            <div>
              <span className="eyebrow">Agent API</span>
              <h2>A mandate, not a blank check.</h2>
              <p className="lead">
                Each agent gets a scoped API key and a versioned mandate. It can ask for money. It cannot approve,
                raise its own limits, or touch a key that moves funds.
              </p>
              <div className="rule-list">
                <div>
                  <i>01</i>
                  <span>Per-action and rolling caps, enforced under a row lock so parallel requests can&apos;t slip past the budget.</span>
                </div>
                <div>
                  <i>02</i>
                  <span>Counterparty allowlist. Anything else is blocked before a human sees it.</span>
                </div>
                <div>
                  <i>03</i>
                  <span>Any signer can pause an agent instantly. Only the owner can resume it.</span>
                </div>
              </div>
            </div>
            <div className="code">
              <div className="code-bar">
                <span>agent → scrim</span>
                <span>request_only</span>
              </div>
              <pre dangerouslySetInnerHTML={{ __html: AGENT_SNIPPET }} />
            </div>
          </div>
        </section>

        <section className="section" id="security">
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="eyebrow">Security model</span>
                <h2>Built so a breached server still can&apos;t spend.</h2>
              </div>
              <p>
                Scrim coordinates. It doesn&apos;t hold custody. The design and the threat model are public in the repository.
              </p>
            </div>
            <div className="split-cards">
              <div className="card list-card yes">
                <h3>What Scrim enforces</h3>
                <ul>
                  <li>Sign-in only through a NEP-413 signature from a full-access key, checked on-chain</li>
                  <li>Single-use, five-minute challenges bound to an origin, a purpose and a session</li>
                  <li>Approvals bound to one request commitment, so a signature can&apos;t be replayed on another payment</li>
                  <li>Immutable policy history: every request records the mandate version that judged it</li>
                  <li>Append-only audit trail for every treasury action</li>
                </ul>
              </div>
              <div className="card list-card no">
                <h3>What Scrim never holds</h3>
                <ul>
                  <li>Wallet private keys or seed phrases</li>
                  <li>Agent keys in recoverable form (they are stored only as hashes)</li>
                  <li>Authority to move funds without your signers</li>
                  <li>Session tokens readable by page scripts (they are httpOnly, Secure cookies)</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="section" id="status" style={{ paddingTop: 0 }}>
          <div className="wrap">
            <div className="section-head">
              <div>
                <span className="eyebrow">Status</span>
                <h2>What works today, and what&apos;s next.</h2>
              </div>
              <p>Scrim makes no claim the code can&apos;t back up. Shielded balances and cryptographic disclosures ship only after their circuits and contracts have been independently reviewed.</p>
            </div>
            <div className="roadmap">
              <div className="card">
                <span className="pill pill-green">Live</span>
                <h3>Treasury control plane</h3>
                <p>Wallet sign-in, individual and team treasuries, agent mandates and keys, policy enforcement, wallet-signed threshold approvals, audit log.</p>
              </div>
              <div className="card">
                <span className="pill pill-amber">In progress</span>
                <h3>Settlement execution</h3>
                <p>Live NEAR Intents quotes for USDC NEAR → Base are working. Next: the deposit signature, a finality watcher and an on-chain treasury contract.</p>
              </div>
              <div className="card">
                <span className="pill">Research</span>
                <h3>Shielded notes &amp; proofs</h3>
                <p>A note-commitment pool with nullifiers, and reader-bound, expiring receipt, solvency and payroll proofs generated on your device.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="closing">
          <div className="wrap">
            <img src="/scrim-mark.png" alt="" />
            <h2>Move money on purpose.</h2>
            <p>Connect a NEAR wallet, set your rules, and give your first agent a mandate in under two minutes.</p>
            <Link href="/app" className="btn btn-primary btn-lg">
              Open the workspace <span className="arrow">↗</span>
            </Link>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="wrap">
          <Link href="/" className="brand" style={{ fontSize: 18 }}>
            <img src="/scrim-mark.png" alt="" style={{ width: 24, height: 24 }} />
            scrim
          </Link>
          <span>Private treasury rails for people and autonomous agents.</span>
          <nav>
            <a href={REPO}>GitHub</a>
            <a href={`${REPO}/blob/main/BACKEND_SPEC.md`}>Specification</a>
            <a href="/api/health">Status</a>
          </nav>
        </div>
      </footer>
    </>
  );
}

function DemoRequest() {
  return (
    <div className="demo-stage" aria-label="Example payment request awaiting approval">
      <div className="demo-card">
        <div className="demo-head">
          <span className="who">
            <span className="agent-dot">PA</span> Procurement agent
          </span>
          <span className="pill pill-amber">Awaiting approval</span>
        </div>
        <div className="demo-amount">
          <span className="section-label">Pay on Base</span>
          <strong>
            420.00<small>USDC</small>
          </strong>
          <div className="demo-route">
            <span>NEAR</span>
            <i />
            <span>Intents</span>
            <i />
            <span>Base · 0x7a3f…c291</span>
          </div>
        </div>
        <div className="checks">
          <div className="check">
            <span className="mark">✓</span>
            <b>Compute vendor is approved</b>
            <small>counterparty</small>
          </div>
          <div className="check">
            <span className="mark">✓</span>
            <b>420 of 500 per action</b>
            <small>per-action cap</small>
          </div>
          <div className="check">
            <span className="mark">✓</span>
            <b>1,260 of 2,000 today</b>
            <small>rolling cap</small>
          </div>
        </div>
        <div className="demo-foot">
          <span className="signers">
            <span className="stack">
              <span className="avatar ok">A</span>
              <span className="avatar pending">?</span>
            </span>
            1 of 2 signatures
          </span>
          <span className="btn btn-primary btn-sm" aria-hidden="true">
            Approve with wallet
          </span>
        </div>
      </div>
      <div className="float-chip blocked">
        <span className="x">×</span>
        <div>
          <small>Blocked · 09:41</small>
          600.00 USDC exceeds the per-action cap
        </div>
      </div>
    </div>
  );
}

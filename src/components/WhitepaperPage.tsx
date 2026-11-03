import Link from "next/link";
import { ROADMAP } from "@/content/roadmap";

const SECTIONS = [
  ["abstract", "Abstract"],
  ["problem", "The problem"],
  ["principles", "Principles"],
  ["design", "How Scrim works"],
  ["accounts", "Accounts and approvals"],
  ["agents", "Agents and x402"],
  ["ask", "Private AI"],
  ["trust", "Trust and security"],
  ["roadmap", "Roadmap"],
  ["closing", "Closing"],
] as const;

export function WhitepaperPage() {
  return (
    <div className="doc-page wrap wp">
      <header className="doc-hero">
        <span className="eyebrow">Whitepaper</span>
        <h1>Scrim: money on NEAR, private when you want it</h1>
        <p className="wp-meta">Version 1.0 · November 2026</p>
        <p className="doc-actions no-print">
          <a className="btn btn-primary" href="/scrim-whitepaper.pdf" download>Download PDF</a>
          <Link className="btn btn-ghost" href="/roadmap">See the roadmap</Link>
        </p>
      </header>

      <div className="wp-layout">
        <nav className="wp-toc no-print" aria-label="Contents">
          <span className="eyebrow plain">Contents</span>
          <ol>{SECTIONS.map(([id, title]) => <li key={id}><a href={`#${id}`}>{title}</a></li>)}</ol>
        </nav>

        <article className="wp-body">
          <section id="abstract">
            <h2>Abstract</h2>
            <p>
              Scrim is a money app built on NEAR. People and teams hold, send, swap and get paid across more than thirty chains, from their own
              wallet in public or from an optional private balance that the public chain never shows. The choice is made per payment, by the
              person paying.
            </p>
            <p>
              Scrim never holds keys or money. Private balances live on NEAR Intents&apos; confidential ledger, every transfer is signed in the
              user&apos;s own wallet, and Scrim keeps only sealed records. On top of that foundation sit the tools real money needs: payment
              links, proofs for a single reader, shared accounts with approvals, software agents that pay within limits, and private AI that
              answers questions about your own money.
            </p>
          </section>

          <section id="problem">
            <h2>The problem</h2>
            <p>
              Public blockchains show everything. Anyone who knows an address can read its balance, every payment it sent and every payment it
              received. For a person that means a salary, a rent payment and a savings balance are all on display. For a business it means
              suppliers, payroll and margins are visible to competitors and to every customer who has ever paid it.
            </p>
            <p>
              Moving money across chains adds a second cost. Each chain needs its own gas coin, its own wallet and its own bridge, and every hop
              leaves another public trail. Privacy tools have existed for years, but most work on one chain, ask people to learn new concepts,
              and cannot answer the question every real business is asked sooner or later: can you prove it?
            </p>
            <p>
              Scrim is built for that gap: private when you want it, public when you choose, across chains, in plain words, and able to prove a
              single fact without revealing the rest.
            </p>
          </section>

          <section id="principles">
            <h2>Principles</h2>
            <ul>
              <li><b>Your keys, always.</b> Scrim receives signatures, never keys. Every move of money is approved in the user&apos;s own wallet.</li>
              <li><b>Privacy by choice.</b> Public and private are both first class. Each payment says which it is before anyone signs.</li>
              <li><b>Show only what is needed.</b> Proofs state one fact, name one reader and expire.</li>
              <li><b>Built on NEAR&apos;s own rails.</b> The ledger, the swaps and the bridge are NEAR Intents. Scrim adds the product, not another pool or bridge.</li>
              <li><b>Plain words.</b> Every screen is written for someone who has never heard the word intent.</li>
            </ul>
          </section>

          <section id="design">
            <h2>How Scrim works</h2>
            <h3>Signing in</h3>
            <p>
              A person connects any NEAR wallet and approves one plain message that names Scrim and the site they opened. The message cannot
              move money. Scrim checks the signature and confirms on chain that the key belongs to the account. Opening the private balance is a
              separate, optional step: a second message, the NEAR Intents ownership message, approved only when the person chooses to use
              private money.
            </p>
            <h3>The private balance</h3>
            <p>
              Private balances live on Confidential Intents, the private ledger that runs beside NEAR. Money deposited from any supported chain
              becomes a private balance. Swaps and transfers settle on the private side, and withdrawals pay out to any chain. The public chain
              sees value enter and leave NEAR Intents, and cannot link a deposit to a later payment.
            </p>
            <h3>Moving money</h3>
            <p>
              Adding money, sending, swapping and withdrawing share one flow. Scrim asks NEAR Intents for a quote, the wallet signs the exact
              transfer, Scrim checks that the signed payload names the quoted coin, amount and deposit address, submits it once, and follows it
              to the end. A transfer that differs from its quote is never offered for signing.
            </p>
            <h3>Any chain</h3>
            <p>
              Through the NEAR Intents bridge, Scrim reaches more than thirty networks, including Bitcoin, Ethereum, Solana, Base, Arbitrum,
              TRON, Stellar and Zcash, with shielded Zcash addresses supported for payouts. People can pay from NEAR, EVM and Solana wallets
              directly, and payment links accept any supported coin.
            </p>
            <h3>Payment links and selling</h3>
            <p>
              A payment link asks for an amount in a chosen coin. The payer needs no account and pays from whatever they hold. A product listed
              under Sell adds a price and a deliverable, a text, a link or a call to the owner&apos;s own API, delivered once the payment is
              confirmed. Every product also has an address agents can pay over x402. Sales land in the owner&apos;s private balance or wallet,
              as they choose, and buyers stay anonymous.
            </p>
            <h3>Proofs</h3>
            <p>
              A proof states one fact, such as &quot;holds at least $5,000&quot; or &quot;paid this invoice&quot;, for one named reader, with an
              expiry of one, seven or thirty days. Scrim checks the private balance or the completed payment and signs the statement. The reader
              opens a link and the signature is checked in their browser, with no account. The proof format is versioned so that proving can move
              onto the user&apos;s own device.
            </p>
          </section>

          <section id="accounts">
            <h2>Accounts and approvals</h2>
            <p>
              An account can belong to one person or be shared. In a shared account the owner invites approvers, and each one joins only by
              accepting. The account sets how many approvals a payment needs, M of N, and every approval is a wallet signature bound to one
              request, naming its amount and recipient, so it cannot be reused.
            </p>
            <p>
              Spending limits apply to people and agents alike. Every request is checked against them first, and a request outside them is
              stopped before anyone is asked. A Receipts tab lists everything paid, with a spreadsheet download for accounting, and a bell shows
              each person what is waiting for them.
            </p>
          </section>

          <section id="agents">
            <h2>Agents and x402</h2>
            <p>
              An agent is software that spends on someone&apos;s behalf: an AI assistant, a payroll script or a billing job. The owner adds it to
              an account and sets its rules: the most per payment, the most per time window, the recipients it may pay and an optional expiry.
              Scrim shows the agent a key once and stores only its hash. The key can ask to pay. It cannot approve, change its rules or move money
              on its own.
            </p>
            <p>
              By default an agent asks and people approve. An owner can also give it a wallet of its own, an OutLayer agent wallet whose key is
              created and kept inside a secure enclave. With that wallet the agent pays by itself, still inside the same Scrim limits, while the
              wallet enforces a second, independent set of rules the owner sets on OutLayer. On mainnet the wallet can pay from a private balance,
              so recipients see a payment arrive, not which wallet sent it. A request that repeats a recent one, the same recipient and amount
              within ten minutes, waits for a person even inside the limits, because a false &ldquo;the payment failed, retry&rdquo; note is how an
              agent would pay twice.
            </p>
            <p>
              x402 is how software pays for things on the web: a site answers a request with a price, the buyer pays, and the site returns what
              was asked for. Scrim agents find paid services in the public x402 catalog and buy from them on Ethereum, Base, Arbitrum, Optimism,
              Polygon, BNB Chain, Avalanche, Solana and through NEAR Intents. Agents connect over MCP or plain HTTPS, and owners receive signed
              webhooks at every step.
            </p>
          </section>

          <section id="ask">
            <h2>Private AI</h2>
            <p>
              Ask answers questions about a person&apos;s own money in plain words, such as what was paid to suppliers last week. The question and
              the person&apos;s own records go to a model running in NEAR AI Cloud&apos;s confidential hardware. Before asking, Scrim fetches the
              model&apos;s attestation report with a fresh nonce. After answering, it checks the signature over the exact request and response
              and confirms the signing key is the one the report names. Scrim keeps no copy of the question or the answer.
            </p>
          </section>

          <section id="trust">
            <h2>Trust and security</h2>
            <p>
              Keys never leave the user&apos;s wallet, so Scrim cannot sign a transfer or spend funds. Every transfer is checked against its quote
              and accepted once, and everything Scrim stores about a person&apos;s money is sealed and shown only to them.
            </p>
            <p>
              The public chain sees money enter and leave NEAR Intents, and nothing that links the two. A payer sees only what was asked, and a
              proof reader sees one fact. The code was reviewed in October 2026, and every confirmed issue was fixed with a test.
            </p>
          </section>

          <section id="roadmap">
            <h2>Roadmap</h2>
            <p>Scrim ships in steps. The full list, with a line on each item, is on the <Link href="/roadmap">roadmap</Link>.</p>
            {ROADMAP.map((stage) => (
              <div key={stage.id} className="wp-stage">
                <h3>{stage.label}</h3>
                <p>{stage.items.map((i) => i.title).join(" · ")}</p>
              </div>
            ))}
          </section>

          <section id="closing">
            <h2>Closing</h2>
            <p>
              Money should be as private as the person holding it wants it to be, and as provable as the people they deal with need it to be.
              Scrim brings that to NEAR: one app, any chain, your keys, your choice on every payment, and rules that let teams and software spend
              safely. It is open source, live today, and growing one release at a time.
            </p>
          </section>
        </article>
      </div>
    </div>
  );
}

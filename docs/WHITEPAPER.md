# Scrim: money on NEAR, private when you want it

*Version 1.0 · November 2026* · [Read online](https://scrimfinance.vercel.app/whitepaper) · [PDF](https://scrimfinance.vercel.app/scrim-whitepaper.pdf)

## Abstract

Scrim is a money app built on NEAR. People and teams hold, send, swap and get paid across more than thirty chains, from their own wallet in public or from an optional private balance that the public chain never shows. The choice is made per payment, by the person paying.

Scrim never holds keys or money. Private balances live on NEAR Intents' confidential ledger, every transfer is signed in the user's own wallet, and Scrim keeps only sealed records. On top of that foundation sit the tools real money needs: payment links, proofs for a single reader, shared accounts with approvals, software agents that pay within limits, and private AI that answers questions about your own money.

## The problem

Public blockchains show everything. Anyone who knows an address can read its balance, every payment it sent and every payment it received. For a person that means a salary, a rent payment and a savings balance are all on display. For a business it means suppliers, payroll and margins are visible to competitors and to every customer who has ever paid it.

Moving money across chains adds a second cost. Each chain needs its own gas coin, its own wallet and its own bridge, and every hop leaves another public trail. Privacy tools have existed for years, but most work on one chain, ask people to learn new concepts, and cannot answer the question every real business is asked sooner or later: can you prove it?

Scrim is built for that gap: private when you want it, public when you choose, across chains, in plain words, and able to prove a single fact without revealing the rest.

## Principles

- **Your keys, always.** Scrim receives signatures, never keys. Every move of money is approved in the user's own wallet.
- **Privacy by choice.** Public and private are both first class. Each payment says which it is before anyone signs.
- **Show only what is needed.** Proofs state one fact, name one reader and expire.
- **Built on NEAR's own rails.** The ledger, the swaps and the bridge are NEAR Intents. Scrim adds the product, not another pool or bridge.
- **Plain words.** Every screen is written for someone who has never heard the word intent.

## How Scrim works

### Signing in

A person connects any NEAR wallet and approves one plain message that names Scrim and the site they opened. The message cannot move money. Scrim checks the signature and confirms on chain that the key belongs to the account. Opening the private balance is a separate, optional step: a second message, the NEAR Intents ownership message, approved only when the person chooses to use private money.

### The private balance

Private balances live on Confidential Intents, the private ledger that runs beside NEAR. Money deposited from any supported chain becomes a private balance. Swaps and transfers settle on the private side, and withdrawals pay out to any chain. The public chain sees value enter and leave NEAR Intents, and cannot link a deposit to a later payment.

### Moving money

Adding money, sending, swapping and withdrawing share one flow. Scrim asks NEAR Intents for a quote, the wallet signs the exact transfer, Scrim checks that the signed payload names the quoted coin, amount and deposit address, submits it once, and follows it to the end. A transfer that differs from its quote is never offered for signing.

### Any chain

Through the NEAR Intents bridge, Scrim reaches more than thirty networks, including Bitcoin, Ethereum, Solana, Base, Arbitrum, TRON, Stellar and Zcash, with shielded Zcash addresses supported for payouts. People can pay from NEAR, EVM and Solana wallets directly, and payment links accept any supported coin.

### Payment links and selling

A payment link asks for an amount in a chosen coin. The payer needs no account and pays from whatever they hold. A product listed under Sell adds a price and a deliverable, a text, a link or a call to the owner's own API, delivered once the payment is confirmed. Every product also has an address agents can pay over x402. Sales land in the owner's private balance or wallet, as they choose, and buyers stay anonymous.

### Proofs

A proof states one fact, such as "holds at least $5,000" or "paid this invoice", for one named reader, with an expiry of one, seven or thirty days. Scrim checks the private balance or the completed payment and signs the statement. The reader opens a link and the signature is checked in their browser, with no account. The proof format is versioned so that proving can move onto the user's own device.

## Accounts and approvals

An account can belong to one person or be shared. In a shared account the owner invites approvers, and each one joins only by accepting. The account sets how many approvals a payment needs, M of N, and every approval is a wallet signature bound to one request, naming its amount and recipient, so it cannot be reused.

Spending limits apply to people and agents alike. Every request is checked against them first, and a request outside them is stopped before anyone is asked. A Receipts tab lists everything paid, with a spreadsheet download for accounting, and a bell shows each person what is waiting for them.

## Agents and x402

An agent is software that spends on someone's behalf: an AI assistant, a payroll script or a billing job. The owner adds it to an account and sets its rules: the most per payment, the most per time window, the recipients it may pay and an optional expiry. Scrim shows the agent a key once and stores only its hash. The key can ask to pay. It cannot approve, change its rules or move money on its own.

By default an agent asks and people approve. An owner can also give it a wallet of its own, an OutLayer agent wallet whose key is created and kept inside a secure enclave. With that wallet the agent pays by itself, still inside the same Scrim limits, while the wallet enforces a second, independent set of rules the owner sets on OutLayer. On mainnet the wallet can pay from a private balance, so recipients see a payment arrive, not which wallet sent it.

x402 is how software pays for things on the web: a site answers a request with a price, the buyer pays, and the site returns what was asked for. Scrim agents find paid services in the public x402 catalog and buy from them on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Solana and through NEAR Intents. Agents connect over MCP or plain HTTPS, and owners receive signed webhooks at every step.

## Private AI

Ask answers questions about a person's own money in plain words, such as what was paid to suppliers last week. The question and the person's own records go to a model running in NEAR AI Cloud's confidential hardware. Before asking, Scrim fetches the model's attestation report with a fresh nonce. After answering, it checks the signature over the exact request and response and confirms the signing key is the one the report names. Scrim keeps no copy of the question or the answer.

## Trust and security

Scrim is designed so that the party holding each piece of information is the one that needs it, and nobody else.

| Party | Sees | Cannot |
| --- | --- | --- |
| The public chain | Value entering and leaving NEAR Intents | Link a deposit to a later payment |
| NEAR Intents' private ledger | Private balances and transfers, as a bank sees an account | Move money without the owner's signature |
| Scrim | Each person's own records, sealed at rest | Hold keys, spend funds or sign a transfer |
| A payer on a link | The amount and coin asked for | See the requester's balance or history |
| A proof reader | One fact, who it is for, when it expires | See the balance, other payments or history |

- **Keys stay in the wallet.** A breached server cannot sign a transfer.
- **What you sign is what you were quoted.** Payloads are checked against the quote and accepted once.
- **Sealed records.** Amounts, recipients, notes and session tokens are sealed with AES-256-GCM, bound to their record, under keys that can be rotated without losing data.
- **One person never sees another's data.** A standing test has a stranger and an invited person try to read or change someone else's records, and every attempt is refused.
- **Reviewed.** The code was reviewed in October 2026 across sign in, every money flow, agents and x402, and the cryptography. Every confirmed issue was fixed with a regression test.

## Roadmap

Scrim ships in steps. The full list, with a line on each item, is on the [roadmap](https://scrimfinance.vercel.app/roadmap).

**Live:** Private balance · Add, send and swap on 30+ chains · Payment links · Sell to people and agents · Proofs · Shared accounts · Agents with limits · Ask your money · Wallets and alerts

**Next:** Hire agents on NEAR AI Agent Market · Payroll batches · Agents that swap · Sell to every x402 buyer · Ask drafts a payment · One budget for all agents · Memos for exchange deposits

**Later:** Proofs made on your device · Account rules on chain · Sign in with any wallet type · Hardware proof for Ask

## Closing

Money should be as private as the person holding it wants it to be, and as provable as the people they deal with need it to be. Scrim brings that to NEAR: one app, any chain, your keys, your choice on every payment, and rules that let teams and software spend safely. It is open source, live today, and growing one release at a time.

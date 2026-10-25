# Architecture

Scrim is a thin, careful layer between a person's wallet and NEAR's private ledger. It does not invent its own privacy system or its own bridge.

```
 Your wallet ──signs──▶  Scrim service  ──asks──▶  NEAR Intents (1Click API)
 (holds keys)            sign-in, records,          private ledger (Confidential Intents)
                         links, proofs, teams       + bridge to 30+ networks
        ▲                        │
        └── you approve every transfer and every team approval
```

## The layers

### 1. Private ledger: NEAR Intents, private mode
Money lives here, not with Scrim. Confidential Intents runs a private ledger beside NEAR. Deposits become private balances; swaps and transfers settle on the private side; withdrawals pay out to any chain. A deposit can't be matched to a later payment. Operated by NEAR Intents' validator set, so those operators can see it. Scrim reads a person's balance only with a session token that person unlocks by signing.

### 2. Wallet: your keys
Any NEAR wallet, through NEAR Connect. The wallet signs (a) a plain sign-in message that names Scrim and the site, and, only if the person chooses a private balance, an ownership message for NEAR Intents, and (b) each transfer or team approval, which names the exact amounts. Scrim receives signatures, never keys.

### 3. Scrim service
- **Sign-in.** One plain message naming Scrim, the site and your account. It can't move money. Scrim checks the signature and checks on-chain that the key belongs to the account. Unlocking the private balance is a separate, optional step: a NEAR Intents "empty intent" that Scrim sends to NEAR Intents to open a private session.
- **Transfers.** Add, swap, send and withdraw share one flow: quote → wallet signs the exact transfer → Scrim submits → Scrim follows it to the end.
- **Payment links.** Anyone can pay a link from any chain with no account. The money lands in the requester's private balance.
- **Proofs.** A statement about a private balance or a completed payment, made for one named reader, signed by Scrim, expiring, revocable. A reader checks the signature in their browser.
- **Team accounts.** Approval thresholds (M of N), spending limits for people and software, wallet-signed approvals bound to one request, and an append-only history.
- **Records.** Postgres. Amounts, recipients, notes and session tokens are sealed with AES-256-GCM before they are stored.

### 4. Public pages
`/pay/<code>` (a payer sees only what is asked) and `/verify` (a reader checks a proof). Neither needs an account.

## What each part can see

| Part | Can see | Cannot do |
| --- | --- | --- |
| Public blockchain | That value moved into and out of NEAR Intents | Link a deposit to a later payment |
| NEAR Intents' private ledger operators | Private balances and transfers | Move money without a signature |
| Scrim | A person's own activity (sealed at rest), team records, who a proof is for | Spend funds, read keys, move money without the person's wallet |
| A payer on a link | The amount, coin and note asked for, and the requester's account name | See balance or history |
| A proof reader | One fact, who it is for, when it expires | See balance, other payments, or history |

## Trust boundaries that matter

1. **Keys never leave the wallet.** A breached Scrim server cannot sign a transfer.
2. **Every transfer is bound to a signature.** The signature covers the exact payload NEAR Intents will execute; Scrim checks it before submitting and accepts it once.
3. **Sessions for the private ledger are sealed and tied to the browser session.** They are never sent to the browser.
4. **Team approvals are bound to one request.** The signed message names amount, recipient and a reference, so a signature can't be reused.
5. **Limits are enforced on the server, before a person sees a request,** and cannot be bypassed by software that only holds an agent key.

## Honest limits

- **Proofs are signed statements today.** Scrim checks the private balance and vouches. They are not zero-knowledge proofs. Proving on the device is on the roadmap.
- **Scrim keeps its own activity record.** NEAR Intents' history endpoint is invite-only; Scrim's record is sealed and shown only to its owner.
- **Team limits are enforced by Scrim,** not by an on-chain contract yet.
- **Private balances exist on NEAR mainnet only.** NEAR Intents has no testnet. People can choose testnet at sign-in for real NEAR testnet balances, team approvals, spending limits and on-chain-verified transfers; private money screens say plainly that they need mainnet.
- **All token, price, logo and chain data is live** (1Click, CoinGecko, FastNEAR, NEAR RPC). Nothing is hardcoded or mocked.
- **Contract wallets and multisig accounts can't sign in yet.** Standard accounts and implicit accounts can.
- **Rate limiting is not built.** It must be added before a public launch (see BACKEND_SPEC §12).
- **No external security review has happened.** Treat it as new software and start with small amounts.

## Delivery sequence

1. ✅ Sign-in, private balance, add/send/swap/withdraw, links, proofs, team approvals and limits.
2. 🚧 Switch on moving money in production (needs a partner key and database).
3. ⏭ Payroll batches and payroll-total proofs; accountant exports.
4. ⏭ Device-side proofs; on-chain team rules.
5. 🔬 Own shielded pool and private inference for software that pays for you.

## Planned

Nothing here is deployed yet. Scrim needs no contract of its own to hold money: private balances live on NEAR Intents' private ledger, and the one on-chain action people take is registering a wallet key on `intents.near` (`add_public_key`).

- **Approval rules on chain.** Move approval thresholds and spending limits from Scrim's service into a NEAR contract, so they bind even if the service is compromised. Before any mainnet use: state-transition tests for every approval path, role and threshold tests, upgrade and recovery tests, and an independent audit.
- **Proofs made on the person's device.** Today Scrim signs proofs after checking the private balance. The proof format is versioned so proving can move to the device later.
- **Hardware proof for Ask.** Ask checks that an answer is signed by the key NEAR AI's report names. Next: verify the report's Intel TDX quote (a DCAP verifier such as `@phala/dcap-qvl`), that the quote binds that key and the request nonce, the measured configuration, and the GPU evidence through NVIDIA's attestation service, then show each check on its own (a part that can't be checked is shown as not checked, never as passed). Needs a NEAR AI key to capture a real report to test against.
- **Selling through the standard x402 route.** Today a seller's address accepts payment through NEAR Intents. Standard x402 buyers need a facilitator (x402.org for Base Sepolia tests, Coinbase CDP for mainnet, which needs an account and key) and a place for the money to land: paying the owner's NEAR Intents deposit address on Base keeps it in Scrim, but the buyer's payment is public on that chain. Settlements are keyed by payer and nonce so one payment delivers once, and a settlement that times out is held for review, never retried blindly.
- **Swaps for agents.** A swap is modelled as a payment request, so limits, approvals and webhooks apply unchanged. The coin always lands in the agent's own balance, never at an address the agent names; the input is valued in dollars from the quote and counts against the per-payment and rolling limits; swaps need approval unless the owner opts in. First release: USDC to a short list of coins.

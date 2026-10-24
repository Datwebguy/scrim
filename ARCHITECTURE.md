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
Any NEAR wallet, through NEAR Connect. The wallet signs (a) a one-time ownership message for sign-in, and (b) each transfer or team approval, which names the exact amounts. Scrim receives signatures, never keys.

### 3. Scrim service
- **Sign-in.** One signature: a NEAR Intents "empty intent" naming your account. It can't move money. Scrim checks the signature, checks on-chain that the key belongs to the account, then uses the same signature to unlock the private balance.
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
- **Private balances exist on NEAR mainnet only.** Testnet is used to develop team features.
- **Contract wallets and multisig accounts can't sign in yet.** Standard accounts and implicit accounts can.
- **Rate limiting is not built.** It must be added before a public launch (see BACKEND_SPEC §12).
- **No external security review has happened.** Treat it as new software and start with small amounts.

## Delivery sequence

1. ✅ Sign-in, private balance, add/send/swap/withdraw, links, proofs, team approvals and limits.
2. 🚧 Switch on moving money in production (needs a partner key and database).
3. ⏭ Payroll batches and payroll-total proofs; accountant exports.
4. ⏭ Device-side proofs; on-chain team rules.
5. 🔬 Own shielded pool and private inference for software that pays for you.

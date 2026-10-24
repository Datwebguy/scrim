# Scrim

**Private money for people and businesses, on NEAR.**

Scrim gives you a private balance. Add money from almost any chain, pay anyone, get paid with a link, swap one coin for another, and prove a single fact to a single person. Nobody else sees the rest. It is built on NEAR Intents and its private mode (Confidential Intents), and Scrim never holds your keys or your money.

**The problem.** Public blockchains show everyone your balance and every payment. That's uncomfortable for a person and unworkable for a business: competitors read your supplier payments, and anyone who pays you can see everything else you hold. Existing privacy tools are hard to use, cover one chain, or can't answer "can you prove it?"

**The product.** One account, plain words, any chain. See [PRODUCT.md](PRODUCT.md).

## Try it

| Do this | You will see |
| --- | --- |
| Open `/app` and press **Connect wallet**; approve one message in any NEAR wallet | You are signed in, and your **private balance** is unlocked. The message cannot move money. |
| Open **Add money**, pick a coin and a network | A one-time deposit address on that network, with the minimum and warnings. |
| Send a small amount to that address | The deposit shows "Waiting for your deposit", then lands in your private balance. |
| Open **Home** and switch to **What the public sees** | "Nothing": no balance, no payments, no link between money in and money out. |
| **Send** to another NEAR account, or to any address on any chain | A price and fee. Your wallet approves the exact transfer. |
| **Swap** one coin for another | A price, then the swap inside your private balance. |
| **Get paid**, create a link, open it in a private window | A payment page that needs no account. The payer picks any coin. |
| **Proofs**, create "holds at least $1,000" for a named reader | A link. Open it (no account needed) and see a pass/fail check with the reader's name and expiry. |
| **Team**, set up 2-of-3 approvals and a software helper with spending limits | Requests over the limit are blocked before anyone sees them. Approved ones are paid from your private balance. |

Moving money needs a NEAR Intents partner key on the server. Until it is set, sign-in, the private balance, proofs and team features work and the money screens say "being switched on".

## What works today

| Capability | Status |
| --- | --- |
| Wallet sign-in with one signature that also unlocks the private balance | ✅ Checked against live NEAR mainnet |
| Private balance with USD value | ✅ Checked against live NEAR Intents |
| Add money (30+ networks), send, swap, pay out to any chain | ✅ Built and tested; needs a partner key to switch on |
| Payment links, no account needed to pay | ✅ Built and tested |
| Proofs: balance at least, payment; reader-bound, expiring, revocable | ✅ Signed by Scrim today |
| Team approvals (M of N), spending limits, software helpers, history | ✅ Built and tested |
| Proofs generated on your own device | ⏭ Next |
| Payroll batches, accountant exports, on-chain team rules | ⏭ Next |
| Own shielded pool | 🔬 Research |

Honest limits are listed in [ARCHITECTURE.md](ARCHITECTURE.md#honest-limits) and [BACKEND_SPEC.md](BACKEND_SPEC.md#12-known-gaps-before-a-public-launch). Scrim has not had an external security review: start with small amounts.

## How NEAR fits

- **NEAR Intents + Confidential Intents:** the private ledger, the swaps, and the bridge to 30+ networks.
- **NEAR accounts and NEAR Connect:** sign-in and every approval, with the person's own wallet.
- **NEAR AI Cloud / OutLayer (planned):** private decision logic and device-independent proofs.

## Tracks

Primary: **Privacy & Private AI**. Also fits **Real-World Money** (payroll-style payouts, invoicing links, stablecoin rails), **AI Security & Defense** (spending limits, approvals) and **Agent Economy** (software that pays under limits). Details in [HACKATHON.md](HACKATHON.md).

## Run it locally

Requires Node 20+ and Postgres 14+.

```sh
npm install
createdb scrim && createdb scrim_test
cp .env.example .env.local
npm run keys            # prints two secrets; paste them into .env.local
npm run db:migrate
npm run dev             # http://localhost:3000
```

```sh
npm test                # 54 tests; uses TEST_DATABASE_URL (default scrim_test) and resets it
npm run typecheck
npm run build
```

Sign-in uses real NEAR mainnet reads, so it needs internet access. To exercise money screens without funds, point `ONECLICK_URL` at a stand-in service.

## Configuration

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres |
| `SCRIM_SECRET_KEY`, `SCRIM_PROOF_KEY` | Seal private records; sign proofs. `npm run keys` makes both. |
| `ONECLICK_API_KEY` | Free partner key from partners.near-intents.org. Switches on moving money. |
| `NEXT_PUBLIC_NEAR_NETWORK` | `mainnet` (default) or `testnet` |

`GET /api/health` reports which features are on and names any missing setting (never values). On Vercel, `npm run vercel-build` runs migrations when `DATABASE_URL` is set.

## Layout

```
app/              pages and API routes (homepage, /app, /pay, /verify, /api/v1)
src/protocol/     tested logic shared by server and browser: amounts, signatures, proofs, spending limits
src/server/       sign-in, private access, transfers, links, proofs, teams, NEAR Intents client
src/client/       browser wallet bridge and API helpers
src/components/   screens
db/migrations/    database schema
tests/            protocol and service tests
```

## Documents

[PRODUCT.md](PRODUCT.md) · [ARCHITECTURE.md](ARCHITECTURE.md) · [BACKEND_SPEC.md](BACKEND_SPEC.md) · [NEAR_TOOLS.md](NEAR_TOOLS.md) · [HACKATHON.md](HACKATHON.md) · [RESEARCH.md](RESEARCH.md)

# Research notes

Internal notes behind the design. Competitor and ecosystem names belong here only; they stay out of the README, the product and the code. Checked 24 Oct 2026.

## 1. NEAR's privacy layer, what is true

**Confidential Intents** (live for businesses since 13 Jul 2026). A private chain ("FAR") beside NEAR holds shielded balances as IMT tokens, backed 1:1 by tokens locked in a treasury account on NEAR. *Shield* moves tokens in; *unshield* burns them and releases the backing. Swaps settle privately between allow-listed solvers. Deposits and withdrawals can't be matched to each other. FAR is permissioned and run by a small validator set, so those operators can see balances: privacy is from the public, not from them. Source: docs.near-intents.org/integration/market-makers/confidential-intents.md

**What I verified against the live API**
- `POST /v0/auth/authenticate` with a signed empty intent works without a partner key (HTTP 201). Implicit accounts need no registration. Salt must be current (`current_salt` on `intents.near`), nonce versioned, timestamp within 5 minutes.
- `GET /v0/account/balances` with that session returns `{"balances":[]}` for an empty account.
- `GET /v0/account/history` → 403 "History is invite-only for now".
- `POST /v0/quote` for confidential routes → 401 "User authentication is required" without a partner key plus a session. A public quote works unauthenticated (extra 0.25% fee).
- Bridge `deposit_address` returned addresses for Bitcoin, Solana, TON and NEAR; Stellar needs MEMO mode.
- 205 assets across 37 chains in `/v0/tokens`; 0.001 BTC → USDC quoted in ~12 s; USDC cross-chain ~10 s.

**Not verified:** end-to-end confidential transfer, deposit and withdrawal with real funds (needs a partner key and money). The code paths follow the documented shapes and Trezu's production code; they are tested against a stand-in.

**October 2026 incident.** 29 Sep – 1 Oct: a bug in NEAR Intents' deposit-notification feature let an attacker create unbacked balances and withdraw about $3.8M. Paused ~30 min after detection; all funds returned within 36 hours; feature removed; second bug in the same function patched 7 Oct ($300k bounty). Postmortem published 16 Oct. Lesson: monitoring compared origin-chain totals but not per-user balances against held tokens. For Scrim: start with limits, be plain that it is new software, never hold funds ourselves.

## 2. Trezu (NEAR-DevHub/trezu), the closest official product
Team treasury on Sputnik DAO with Rust backend (Axum), Next.js front end, 10+ languages. Their confidential-treasury design (docs/confidential-treasury.md) shows the DAO flow: a DAO has no keys, so every private action is a DAO proposal calling `v1.signer` (Chain Signatures MPC); the backend extracts the signature from the approved proposal and submits to 1Click. Tokens are stored AES-GCM sealed with a keyring.

**What we took:** exact 1Click request shapes (quote, generate-intent, submit-intent, authenticate, refresh); the bridge flow for deposits (quote with `INTENTS` deposit and `CONFIDENTIAL_INTENTS` recipient, then the bridge address that forwards to the quote account); sealed token storage; idempotent, retry-safe submission thinking; separating "unreachable" from "refused".
**What differs:** Trezu serves DAOs and multisigs. Scrim serves individuals first and businesses second, with a wallet that signs directly (no MPC step), plus payment links and proofs, which Trezu doesn't have.
**UX worth copying:** asset → network → address deposit pattern; "do not reuse the address" warnings; minimum-deposit hints; "move assets from public to confidential" prompts; guest/demo views.

## 3. near.com and NEAR Business
- **near.com:** one personal account (crypto, stocks, perps, earn), "No email. No KYC. Pick a wallet or passkey." Confidential balances with "choose what you reveal". Tone: short and confident.
- **NEAR Business:** "Private from the market. Legible to your auditors." Free treasuries; 0.35% swap fee; gas covered for first 1,000 actions/month; hardware signing; exports for accountants. Positioning sentence worth keeping: *confidentiality is about controlling who can watch your operations, not about hiding them.*
- **Gap Scrim fills:** neither offers payment links with no-account payers, or reader-bound, expiring proofs.

## 4. Private-money apps (competitive landscape)
Closest product found: **Gloam** (gloam.trade), "private money on public chains" for people, teams and agents, mainnet from 21 Oct 2026 on Tempo and Robinhood Chain.
- **Strengths:** device-made zero-knowledge proofs (balance at least, exact balance, payment, payroll total) with a verify page that needs no account; claim links; payroll from a CSV; a clear "what you see / what the public sees" toggle; honest "limits to know" on each feature; no operator holds user keys.
- **Weaknesses / differences:** two chains only; private swaps hide the swapper but not the amounts; new, thin anonymity set, internal review only.
- **Scrim's angle:** reach (30+ networks via NEAR Intents), swaps and transfers whose amounts are private too, no vault of our own to attack, and NEAR's ecosystem (wallets, Intents, accounts). **Scrim's weakness:** proofs are signed statements today, and a NEAR-run private ledger has operators who can see it.
- Other approaches noted by that product's own comparison: FHE with a key committee (Zama), MPC on Solana (Arcium), operator-run zones (Tempo Zones), server-side proving (Helius, devnet), the closest classical design (Railgun). Treat as claims, not verified.

**UX patterns adopted:** side-by-side "you / the public" view; preset amounts; claim-style links; proofs with named reader and 1/7/30-day expiry; verify page without an account; plain "limits" notes.

## 5. Other NEAR pieces looked at
- **OutLayer** (hackathon partner): TEE-held, policy-guarded wallets for software with signed execution receipts and an offline verifier. Possible future home for software helpers and for proofs that don't depend on trusting Scrim.
- **NEAR AI Cloud:** private inference in TEEs with attestations; OpenAI-compatible API at cloud-api.near.ai/v1.
- **SputnikDAO:** roles and thresholds; the base for on-chain team rules.

## 6. Decisions that came out of this
1. Build on Confidential Intents; don't build a pool or a bridge.
2. Lead with people and businesses; software that pays is a section.
3. One signature signs in and unlocks the private balance.
4. Keep our own sealed activity record (history API is invite-only).
5. Proofs ship as signed statements, labelled as such, with a versioned format ready for device proving.
6. Plain words everywhere.

## 7. Open questions
- Partner key terms and limits for confidential routes; fee-sharing options.
- Whether earlier groundwork is allowed under the hackathon's "build during the period" rule.
- Device proving: which proof system, and whether OutLayer attestation is a cheaper first step.
- Regulatory posture for payment links and cross-chain payouts in different regions.

## 8. Sources
docs.near-intents.org (llms.txt index, Confidential Swaps, Signed Intent Execution, User auth, API keys, Fees, Changelog); github.com/near/intents; github.com/NEAR-DevHub/trezu; github.com/near-daos/sputnik-dao-contract; business.near.com; near.com; docs.near.ai; app.outlayer.ai; nearhackathon.com; gloam.trade (docs/compare, proofs, private-swaps); incident coverage: cryptotimes.io, defiprime.com, techflowpost.com.

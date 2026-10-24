# NEAR HACKATHON

Facts below come from https://nearhackathon.com and https://nearhackathon.com/HACKATHON.md (checked 24 Oct 2026). Re-check before submitting; the site says to verify endpoints and versions.

## Dates (UTC)
- Development: **1 Nov 2026 00:00 – 14 Nov 2026 23:59**. Submissions accepted only in this window.
- Judging from 16 Nov. Results by 18 Nov 23:59.
- Prizes in NEAR: $250,000 total. Grand prize $55,000. Per track: $10,000 / $3,000 / $2,000.
- Jury includes Illia Polosukhin, Eddy Lazzarin, Mert Mumtaz, Avichal Garg, Kain Warwick, Haseeb Qureshi, Stepan Gershuni, plus AI judges. Past criteria: technical implementation, design, impact, originality, sustainability.

## Rules that matter
- One submission per team; it can't be edited after sending.
- The repository must be **public**. Judges cannot review private repos.
- A public post on X saying it was built at NEAR HACKATHON, with a video or screenshots.
- A mainnet NEAR account for the payout (the team creates it).
- README should work for AI judges and humans: what it is, the problem, "do X, see Y" steps.
- Don't commit secrets or the submission payload.
- "Build during the hackathon period." This repository has commits from before 1 Nov (see Timing).

## Tracks Scrim fits

| Track | Why |
| --- | --- |
| **Privacy & Private AI** (primary) | Private balance, private transfers and swaps, reader-bound proofs |
| **Real-World Money** | Payment links, payouts to any chain, stablecoin rails, team approvals, records for accountants |
| **AI Security & Defense** | Spending limits, approvals, pause, append-only history, software can ask but never approve |
| **Agent Economy** | Software that pays under limits a person sets |

Select all four; it is still one submission. Not a fit today: Unstoppable DeFi (swaps are a feature, not a venue), Social Money.

## Timing: decide before 1 Nov
Work before 1 Nov exists in this repository's history. The rules say to build during the period. Safest options: (a) ask on the NEAR Discord whether earlier groundwork is allowed, (b) tag the pre-hackathon state and make the commits in the window the visible build, or (c) say plainly in the submission what existed before. Don't leave it unstated.

## Submission checklist
- [ ] Repository public, no secrets, README steps tested from a clean clone
- [ ] Live site working on mainnet with a partner key; database and secrets set
- [ ] Demo video (under 2 minutes): sign in → add money → "what the public sees" → send → payment link → proof check
- [ ] X post: "Built at NEAR HACKATHON" + video/screenshots
- [ ] Mainnet NEAR account for payout created by the team
- [ ] Form: project name, lead, email, team size, tracks, payout account, repo URL, post URL, description

## Draft description (≤ 2000 characters)
Scrim is private money for people and businesses on NEAR. Public blockchains show everyone your balance and every payment. That's uncomfortable for a person and unworkable for a business, and most privacy tools are hard to use, cover one chain, or can't answer "can you prove it?"

With Scrim you sign in with a NEAR wallet and get a private balance only you can see. You can add money from 30+ networks with a one-time address, pay another person or any address on any chain, swap coins privately, and get paid through a link where the payer needs no account. When a bank, landlord or client asks, you can prove one fact (you hold at least an amount, or a payment was made) to one named person. The proof expires, can be taken back, and is checked by the reader in their browser without revealing the balance or history.

Teams get approvals (M of N), spending limits for people and software that pay on their behalf, and an append-only record for accountants. Software can ask to pay but only people approve.

How NEAR fits: money lives on NEAR Intents' private ledger (Confidential Intents), moves across chains through NEAR Intents and its bridge, and every sign-in and approval is a NEAR wallet signature via NEAR Connect. Scrim never holds keys or funds. Sign-in checks the key on-chain; every transfer is bound to the wallet's signature over the exact payload and can be submitted once.

Honest status: proofs are signed by Scrim today; proving on the user's device is next. Moving money needs a NEAR Intents partner key. Repo has 54 tests and has not had an external review.

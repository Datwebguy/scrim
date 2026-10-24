# Scrim

**Private money for people and businesses, on NEAR.**

Scrim gives you a private balance. You can add money from almost any chain, pay anyone, get paid with a link, swap one coin for another, and show a single fact to a single person when they need to know. Nobody else can see the rest.

## The problem

Public blockchains show everything. Anyone can look up your balance, see who you paid, and follow the trail from your salary to your rent. For a person that is uncomfortable. For a business it is unworkable: competitors read your supplier payments, and anyone who pays you can see everything else you hold.

The privacy tools that exist are hard to use, work on one chain, or can't answer the question every real business gets asked: *"Can you prove it?"*

## What Scrim does

| You want to… | In Scrim |
| --- | --- |
| Keep your balance and payments to yourself | A private balance. Only you can see it. |
| Bring money in from Bitcoin, Ethereum, Solana, Base, and 30+ networks | **Add money**: pick a coin and network, send to a one-time address. |
| Pay someone | **Send**: to another Scrim user, or to any address on any chain, in any coin. |
| Trade one coin for another | **Swap**, inside your private balance. |
| Get paid without asking the payer to sign up | **Get paid**: share a link. They pay from whatever they hold. |
| Show a bank, landlord or client one fact | **Proofs**: "holds at least $10,000," or "paid this invoice." Made for one named reader, expires in 1, 7 or 30 days, can be taken back. |
| Run money as a team | **Team**: choose who must approve, set spending limits for people and software, keep a record. |

## Who it is for

- **People** who want financial privacy as a default, not a hobby.
- **Businesses and teams** that pay contractors and suppliers and don't want to publish payroll, but still need to answer to accountants, auditors and banks.
- **Software that pays on your behalf** (automations and AI agents), under limits a person sets. It can ask to pay. Only people approve.

## Principles

1. **Private by default.** Nothing is public unless you choose to show it.
2. **Your keys, always.** Scrim never holds your keys or your money. Every payment needs your wallet to approve the exact amount and recipient.
3. **Show only what's needed.** Proofs name one reader, state one fact, and expire.
4. **Plain words.** If a normal person can't read a screen, we rewrite the screen.
5. **Honest status.** We say what works, what is being switched on, and what is still research. We never claim privacy we can't back up.

## What Scrim is not

- Not a custodian, a bank, or a mixer.
- Not a new blockchain or bridge. Scrim is the product layer on top of NEAR Intents and its private mode (Confidential Intents).
- Not anonymous toward the people who run the private ledger. They can see it, as a bank can see your account. We say so.

## Where it is going

1. **Now:** private balance, add money, send, swap, payment links, signed proofs, team approvals and spending limits.
2. **Next:** proofs generated on your own device, so even Scrim isn't involved; payroll batches and payroll-total proofs; accountant exports; on-chain approval rules for teams.
3. **Later:** our own shielded-note pool (research), and private inference through NEAR AI Cloud for software that pays on your behalf.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how it works and [BACKEND_SPEC.md](BACKEND_SPEC.md) for the detail.

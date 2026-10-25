# Security

Scrim moves people's money, so security reports get priority over everything else.

## Reporting a bug

Please report privately, not in a public issue:

- Open a [private security advisory](https://github.com/Datwebguy/scrim/security/advisories/new) on GitHub.

Include what the bug is, what it could cost, the exact code involved and a way to reproduce it (a test, a script or `curl` commands). Test only against your own local copy or testnet, never against other people's accounts or real funds on mainnet. We confirm receipt within two days, keep you updated, and credit you when the fix ships, unless you'd rather stay anonymous.

## What is in scope

Everything in this repository and the live site: sign-in, the private balance, sending and swapping, payment links and products, proofs, accounts and approvals, agents (keys, limits, their wallets, x402 buying and selling, the MCP server), webhooks, Telegram alerts and Ask.

NEAR Intents, NEAR AI Cloud, OutLayer and wallets are run by others; report issues in them to their teams. We still want to hear if Scrim uses them unsafely.

## How Scrim protects money

- **Keys stay with people.** Scrim never holds a wallet key. Every move of money is a signature from the person's own wallet over the exact payload, checked before it is used and accepted once.
- **What is signed matches what was quoted.** A transfer handed out for signing must name the quoted coin, no more than the quoted amount, only the quote's deposit address, and expire in time; otherwise nobody is asked to sign it.
- **Sign-in** uses single-use challenges that expire in five minutes; the signing key is checked on chain as a full-access key of the account. Network errors fail closed.
- **Joining an account needs a yes.** Adding someone as an approver only sends them an invitation. Until they accept, they can't see the account or approve for it, and they can decline.
- **Approvals** are bound to one request: the signed message shows the amount and recipient first, and a person-chosen name can't add lines to it.
- **Each payout has one owner.** A payment request records the transfer paying it; only that transfer can settle, fail or reopen it, so an earlier or stray attempt can't cause a second payment.
- **Agent limits** (per payment, per time window, allowed recipients, expiry) are enforced on the server under a lock per agent. A payment that may have moved money keeps counting against the limit even if it later fails.
- **Agent wallets** sign only the exact seller terms Scrim checked, at most once per purchase; the signed amount is checked again after signing. Their keys stay in OutLayer's enclave.
- **Outgoing requests** (webhooks, sellers, product APIs) reach only public https addresses: names are resolved once and pinned, internal IPv4 and IPv6 ranges are refused, redirects are never followed, and size and time are capped.
- **Seller content** reaches agents marked as data, cut short, and never as instructions.
- **Data at rest** is sealed with AES-256-GCM and bound to its record; session and agent keys are stored only as hashes.
- **Web**: JSON-only mutations with same-origin checks, rate limits on every route, no caching of API responses, HSTS, framing refused, and raw seller responses served sandboxed.

## Reviews

In October 2026 the code was reviewed in four parts: sign-in and web security; every money flow; agents, x402, MCP and webhooks; and the protocol, cryptography and proofs. The review found no critical issues. Every confirmed issue was fixed, with a regression test in [tests/security.test.ts](tests/security.test.ts) that replays the attack.

## For operators

Production refuses to start without `SCRIM_SECRET_KEY`, `SCRIM_PROOF_KEY` and `SCRIM_AUTH_RECIPIENT`. Generate the keys with `npm run keys`, store them as sensitive variables, and never reuse development keys.

**Changing the sealing key.** Every sealed value carries the ID of the key that sealed it. To change keys: make a new one with `npm run keys`; set `SCRIM_SECRET_KEY` to the new key and `SCRIM_SECRET_KEY_PREVIOUS` to the old one (comma-separated if there is more than one) and deploy; run `npm run rotate` (add `--dry-run` to preview) to seal everything again with the new key; when it reports nothing left, remove `SCRIM_SECRET_KEY_PREVIOUS`. Nothing is lost at any step, and it is safe to run again.

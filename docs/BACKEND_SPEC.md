# Backend specification

This document describes what Scrim's service does today, why, and where it stops. It replaces the earlier planning draft; everything below is implemented and covered by tests unless marked otherwise.

Plain-language overview: [PRODUCT.md](PRODUCT.md). Layers and trust: [ARCHITECTURE.md](ARCHITECTURE.md).

## 1. Boundary

Scrim is a service and web app between a wallet and NEAR Intents' private mode. It never holds keys or funds. It does four jobs: prove who someone is, move money by asking NEAR Intents and passing along what the wallet signed, keep a sealed record for the person, and run team rules.

Stack: Next.js (App Router), TypeScript, Postgres, NEAR Connect in the browser. All service logic lives in `src/server`; shared, tested logic in `src/protocol`.

## 2. Sign-in and private access

One signature does both.

1. `POST /api/v1/auth/challenge { accountId, network }` returns a plain message ("Sign in to Scrim", the site, the account, and a line saying it moves no money) with a random 32-byte nonce and the site as recipient. The challenge is stored, single use, valid 5 minutes.
2. The wallet signs it (NEP-413). `POST /api/v1/auth/verify` checks: the challenge exists, is unused and unexpired; the signature is valid ed25519 over the NEP-413 digest; the account ID in the message matches; **on chain at final finality** the key is a full-access key on that account, or, for an implicit account never seen on chain, the key is the one the account ID is derived from. The challenge is then consumed atomically.
3. A session is created: random 256-bit token, stored only as a SHA-256 hash, delivered as an httpOnly, SameSite=Lax cookie (Secure in production), 12 hours.
4. Optional, mainnet only: `POST /api/v1/private/unlock-challenge` returns an ownership message: `{"deadline":…,"intents":[],"signer_id":"<account>"}` with a 32-byte versioned nonce (magic, version 0, the current salt read from `intents.near`, deadline, issue time, 7 random bytes) and recipient `intents.near`. Once the wallet signs it, `POST /api/v1/private/unlock` verifies it and sends it to NEAR Intents (`/v0/auth/authenticate`) to open a private session. Named accounts must first have registered their key on `intents.near` (`has_public_key`); if not, the person is shown a one-time "turn on private mode" step (a single wallet transaction calling `add_public_key`). Returned tokens are sealed (AES-256-GCM, bound to session and account) and refreshed when under a minute remains. They are never sent to the browser.

An "empty intent" authorises reading a balance and nothing else; it cannot move funds.

## 3. Money movement

Four actions, one lifecycle. All need a NEAR Intents partner key (`ONECLICK_API_KEY`) and NEAR mainnet; without it the service answers "Private transfers aren't switched on yet" and sign-in, balances, proofs and team features still work.

| Action | Quote | Result |
| --- | --- | --- |
| Add money | `FLEX_INPUT`, deposit type `INTENTS`, recipient type `CONFIDENTIAL_INTENTS`, no private session needed | A one-time deposit address on the chosen network, via the bridge's `deposit_address` (memo handled for chains that need one) |
| Swap | `EXACT_INPUT`, private → private | Another asset in the same private balance |
| Send to a person | `EXACT_OUTPUT`, private → private, recipient is a NEAR account | The recipient gets exactly the stated amount |
| Send to any address | `EXACT_OUTPUT`, private → `DESTINATION_CHAIN` | Payout on any supported chain, in any supported asset (swap and bridge in one step) |

Lifecycle: `awaiting_deposit` / `awaiting_signature` → `processing` → `success`, `refunded`, `failed`, `expired`, `cancelled`.

1. **Create.** Scrim requests a live quote (with the partner key plus the person's private session). It asks NEAR Intents to generate the transfer for signing, and **refuses to continue if the transfer names any signer other than the person**.
2. **Sign.** The wallet signs the exact payload. `POST /transfers/:id/sign` verifies the signature against that payload and the signed-in key, claims the transfer atomically (so it can only be submitted once), and submits it.
3. **Follow.** Status is read from NEAR Intents until it ends. The transfer's quote address, amounts, recipient and note are sealed.
4. **Team requests.** The owner of a team account can pay an approved request from their private balance: it becomes a payout on Base (USDC), marks the request `submitting`, then `settled`, `failed`, or back to `approved` on refund.

Fees come from the quote and are shown before signing. With a partner key NEAR Intents charges its partner schedule (typically 0.20%, 0.01% on stablecoins); without one an extra 0.25% applies.

## 4. Payment links

`POST /links` creates a 10-character code (no look-alike characters) for an amount in an asset, with a note and 1, 7 or 30 days. Public routes:

- `GET /pay/:code` shows the ask and the requester's account name, nothing else.
- `POST /pay/:code/start { fromAssetId, refundAddress }` creates a quote from the payer's chosen asset to the requester's private balance and returns an address to pay. The refund address is validated for its network. Ten unfinished payments per link at most.
- `GET /pay/:code/status/:id` follows one payment by its random ID. The link flips to `paid` on success.

## 5. Proofs

Types: **balance at least** (in dollars, or in one asset) and **payment** (a completed send, exact or "at least"). Each proof names one reader (written into the statement), expires in 1, 7 or 30 days, and can be revoked.

Format: `scrimproof1.<payload>.<signature>`. The payload is canonical JSON; the signature is ed25519 over `sha256("scrim:proof:v1:" + payload)`. The server refuses to issue a claim the person's private balance doesn't support. A reader opens `/verify#<proof>` (the fragment never reaches a server), the browser fetches Scrim's public key and checks the signature, expiry and, optionally, that the reader name matches; one tiny public call (`/proofs/state/:id`) tells it whether the owner took the proof back. The proof never contains the real balance or the account.

Honest scope: this is a signed statement. Scrim looked at the balance and vouches for it. Device-side proving is the next step. The format is versioned for it.

## 6. Team accounts

- **Accounts:** personal (1 of 1) or team (M of N, up to 20 signers). Non-members get "not found", so IDs reveal nothing.
- **Requests:** a signer creates a payment request (USDC to a Base address). Amounts use integer minor units; idempotency keys are required.
- **Spending limits for software:** each agent gets a hashed key and versioned limits (per payment, per rolling window, approved recipients, optional expiry, pause). Requests are judged by a pure, tested policy engine inside a transaction holding a per-agent row lock, so parallel requests cannot together exceed the budget. A blocked request is recorded and never reaches an approver. Any signer can pause an agent; only the owner can resume it or change limits. Agents can only ask.
- **Approvals:** each approval is a wallet signature over a message stating the account, amount, recipient, request ID and reference. The challenge is bound to the requesting session and to that request, so it can't be replayed elsewhere. When the threshold is reached the request becomes `approved`.
- **History:** an append-only table records every action.

## 7. Data

Postgres, migrations in `db/migrations`. Sealed with AES-256-GCM (key `SCRIM_SECRET_KEY`, associated data binds each value to its row): transfer details, link notes, proof statements, private session tokens. Stored as hashes: session tokens, agent keys. Never stored: wallet keys, seed phrases.

## 8. API

All JSON under `/api/v1`. Every response is `Cache-Control: no-store`. Mutations require `application/json` and reject cross-origin browser requests; bodies are capped at 32 KB.

| Area | Endpoints |
| --- | --- |
| Health | `GET /api/health` (reports which features are on and any missing setting names) |
| Sign-in | `POST /auth/challenge`, `POST /auth/verify`, `POST /auth/logout`, `GET /me` |
| Private balance | `GET /private`, `POST /private/unlock-challenge`, `POST /private/unlock`, `GET /assets` |
| Transfers | `POST /transfers/preview`, `POST /transfers`, `GET /transfers`, `GET /transfers/:id`, `POST /transfers/:id/sign`, `POST /transfers/:id/cancel` |
| Links | `POST /links`, `GET /links`, `POST /links/:code/close`; public: `GET /pay/:code`, `POST /pay/:code/start`, `GET /pay/:code/status/:id`, `GET /assets/public` |
| Proofs | `POST /proofs`, `GET /proofs`, `POST /proofs/:id/revoke`; public: `GET /proofs/key`, `GET /proofs/state/:id` |
| Teams | `GET/POST /treasuries`, `GET /treasuries/:id`, `POST /treasuries/:id/payments`, `POST /treasuries/:id/agents`, `PATCH/PUT /agents/:id`, `GET /payments/:id`, `POST /payments/:id/approval-challenge`, `/approve`, `/cancel`, `/pay` |
| Software (agent key) | `GET /agent`, `GET/POST /agent/payments` |

## 9. Threat model

| Threat | Control |
| --- | --- |
| Forged sign-in | NEP-413 signature plus on-chain key ownership check; single-use challenge bound to the account |
| Stolen server data | Sensitive values sealed; sessions and keys stored as hashes; no wallet keys exist to steal |
| Server asked to move money without the person | Every transfer needs the wallet's signature over the exact payload; submitted once |
| Substituted transfer | Scrim refuses a generated transfer that names another signer; signature is checked against the issued payload |
| Replayed approval | Challenge bound to session and to one request reference |
| Agent overspend | Server-side limits under a row lock; recipients allowlist; pause; agents can't approve |
| Proof sent to the wrong person | Reader name is part of the signed statement; reader can check their own name |
| Forged or altered proof | ed25519 signature over the payload; any change fails |
| Stale proof | Expiry inside the signed statement; owner revocation |
| Link abuse | Per-link cap on open payments; refund address validation. **Per-IP rate limiting is not built.** |
| Upstream outage or incident | Clear "try again" states; transfers fail closed; money is never debited by Scrim itself |

## 10. Tests

54 automated tests: protocol (amounts, canonical encoding, NEP-413, NEAR Intents nonces, spending-limit engine) and service integration (sign-in replay, forgery and tampering; private balance unlock; sealed storage; every transfer kind, including wrong signer, wrong wallet, double submit, expiry; payment links; proofs including tampering, wrong key, expiry, wrong reader, revocation; team approvals, limits under concurrency, idempotency, privacy between accounts). The network is replaced by a stand-in in tests so failure cases can be exercised safely. Sign-in, the key check and private balance reads were also checked against live NEAR mainnet and NEAR Intents.

## 11. Configuration

See `.env.example`. Required: `DATABASE_URL`, `SCRIM_SECRET_KEY`, `SCRIM_PROOF_KEY` (generate with `npm run keys`). To move money: `ONECLICK_API_KEY`. In production the service refuses to run without the secrets, and `/api/health` names whichever are missing.

## 12. Known gaps before a public launch

1. Rate limiting (per IP and per account) on public and sign-in endpoints.
2. External security review of the service and, later, any contracts.
3. Contract-wallet and multisig account sign-in.
4. A background worker to follow transfers when nobody has the page open (today status is refreshed when viewed).
5. Device-side proofs, payroll batches and payroll-total proofs, accountant exports.
6. On-chain team rules.
7. Monitoring and alerting on upstream errors and stuck transfers.

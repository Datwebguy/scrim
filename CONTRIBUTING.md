# Contributing to Scrim

Scrim is money on NEAR, private when you want it. It is a long-term product that holds people's money, so every change is held to that standard. Privacy is a choice people make, never forced on them.

## Read first
[docs/PRODUCT.md](docs/PRODUCT.md) (what and why), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (layers, trust), [docs/BACKEND_SPEC.md](docs/BACKEND_SPEC.md) (what exists), [docs/NEAR_TOOLS.md](docs/NEAR_TOOLS.md) (the NEAR services used) and [SECURITY.md](SECURITY.md).

## How it is built
- The private ledger, swaps and bridge are **NEAR Intents and Confidential Intents**. Do not build our own pool or bridge. Use the 1Click API and the official docs at https://docs.near-intents.org.
- Keys stay in the user's wallet. Scrim only receives signatures. Anything that moves money must be bound to a wallet signature over the exact payload.
- Anything stored about a user's money (amounts, recipients, notes, session tokens) is sealed with AES-256-GCM before it reaches the database.
- Shared logic lives in `src/protocol` and is pure and tested. Service logic lives in `src/server`. Screens live in `src/components`.

## Voice
Write for a normal person. No developer words on screen or in marketing: no "intent", "nonce", "commitment", "mandate", "API", "NEP-413". Say "approve in your wallet", "spending limits", "private balance". Short sentences. Say what a thing does, not what it is built with.

## Honesty
Never claim privacy, proofs or security we can't back up. Proofs are signed by Scrim today, not zero-knowledge. Approvals and limits are enforced by Scrim, not a contract. Say so wherever it matters. Mark unbuilt things as next or research.

## Security rules
- Fail closed. Reject on any mismatch (signer, account, recipient, amount, expiry).
- Single-use challenges; atomic claims for anything that must happen once.
- No secrets in code, logs or browser. Log request IDs, never amounts or addresses.
- Keep tests honest: failure cases (wrong signer, replay, tampering, expiry) get tests, not just the happy path. Every security fix gets a regression test in `tests/security.test.ts`.
- Don't add dependencies without a reason. Pin exact versions.

## Working rules
- Run `npm run typecheck`, `npm test` and `npm run build` before every push. CI runs the same.
- Don't mention other products in the README, UI or code.
- Update the docs when behaviour changes.

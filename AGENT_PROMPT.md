# Guidance for engineering agents working on Scrim

Scrim is private money for people and businesses on NEAR. It is a long-term product, not a demo. Software that pays on a user's behalf is one use among several; it must never be the headline.

## Read first
`PRODUCT.md` (what and why), `ARCHITECTURE.md` (layers, trust), `BACKEND_SPEC.md` (what exists), `NEAR_TOOLS.md`, `RESEARCH.md`, `HACKATHON.md`.

## How it is built
- The private ledger, swaps and bridge are **NEAR Intents and Confidential Intents**. Do not build our own pool or bridge. Use the 1Click API and the official docs at https://docs.near-intents.org.
- Keys stay in the user's wallet. Scrim only receives signatures. Anything that moves money must be bound to a wallet signature over the exact payload.
- Anything stored about a user's money (amounts, recipients, notes, session tokens) is sealed with AES-256-GCM before it reaches the database.
- Shared logic lives in `src/protocol` and is pure and tested. Service logic lives in `src/server`. Screens live in `src/components`.

## Voice
Write for a normal person. No developer words on screen or in marketing: no "intent", "nonce", "commitment", "mandate", "API", "NEP-413". Say "approve in your wallet", "spending limits", "private balance". Short sentences. Say what a thing does, not what it is built with.

## Honesty
Never claim privacy, proofs or security we can't back up. Proofs are signed by Scrim today, not zero-knowledge. Teams' limits are enforced by Scrim, not a contract. Say so wherever it matters. Mark unbuilt things as next or research.

## Security rules
- Fail closed. Reject on any mismatch (signer, account, recipient, amount, expiry).
- Single-use challenges; atomic claims for anything that must happen once.
- No secrets in code, logs or browser. Log request IDs, never amounts or addresses.
- Keep tests honest: failure cases (wrong signer, replay, tampering, expiry) get tests, not just the happy path.
- Don't add dependencies without a reason. Pin exact versions.

## Working rules
- Run `npm run typecheck`, `npm test` and `npm run build` before every push.
- Commit as the repository owner. **Do not add AI tools as author or co-author, and don't add attribution trailers.**
- Don't mention competitors in the README, UI or code. Research notes may.
- Update the docs when behaviour changes.

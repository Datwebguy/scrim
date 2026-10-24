# Contracts

Nothing here is deployed. Scrim does not need its own contract to hold money: private balances live on NEAR Intents' private ledger, and the one on-chain action people take is registering a wallet key on `intents.near` (`add_public_key`).

## Planned

### Team rules contract
Moves approval thresholds and spending limits from Scrim's service onto the chain, so they bind even if the service is compromised. Candidate approaches: build on SputnikDAO-style roles and thresholds (the base Trezu uses), or a small purpose-built contract. Decision after the hackathon.

Needs before any mainnet use: state-transition tests for every approval path, role and threshold tests, upgrade and recovery tests, and an independent audit.

### Own shielded pool (research)
Only if NEAR Intents' private mode can't meet a need. Would require circuits, a verifier contract, device proving and an external review. No claim is made until all of those exist.

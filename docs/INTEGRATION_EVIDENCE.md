# Backend integration evidence

Reviewed upstream sources for the Milestone 1 implementation:

- NEP-413: https://github.com/near/NEPs/blob/master/neps/nep-0413.md — prefix `2^31 + 413`, SHA-256 over Borsh, recipient/nonce, full-access keys. Wallet signatures are off-chain authorizations, never chain transactions.
- NEP-641: https://github.com/near/NEPs/blob/master/neps/nep-0641.md — SHA3-256 domain-separated Borsh envelope, mapped NEP-413 message/nonce/recipient, full-access key precedence, bottom-up delegation path, per-edge expected payload, one final block, recursion limits. Off-chain resolution must never authorize an on-chain mutation directly.
- Rust SDK release: https://github.com/near/near-sdk-rs/releases/tag/near-sdk-v5.29.1 — pinned contract SDK release, ahead of the 5.30 release candidate.
- Chain Signatures: https://github.com/near/docs/blob/master/chain-abstraction/chain-signatures.mdx — outbound signing; distinct chain derivation paths; chain ID bound into payload. Deferred beyond Milestone 1.
- Intents overview: https://github.com/near/docs/blob/master/chain-abstraction/intents/overview.mdx — quote approval and verifier execution. Confidential provider access, exact API, asset IDs, receipts, and disclosure capabilities remain to be independently verified before settlement integration.

Source URLs are integration evidence, not claims that Scrim's implementation is audited or deployed. No confidential settlement API access or device-proof capability is implied by RPC account lookup.

NEAR cross-contract calls are asynchronous. Atomic unshield/call/reshield is a product requirement whose execution and recovery semantics must be designed explicitly for NEAR receipts; EVM atomic rollback semantics must not be assumed. Cross-chain payouts also require a chain-specific privacy analysis: a public destination transfer can expose its recipient and amount. Confidential Intents and MPC signing alone are not evidence that every destination explorer hides them.

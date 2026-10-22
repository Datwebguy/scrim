# Milestones 0 and 1 implementation and release status

## Implemented in this revision

- ESM workspace layout for API, worker boundary, protocol, authorization, storage, settlement boundary, proving boundary, and a Rust treasury-policy contract.
- Typed public protocol definitions; runtime account/config validation rejects unknown treasury fields and requires caller-supplied account IDs.
- NEP-413 signature digest/verification using Node Ed25519 crypto. Nonce, recipient, and exact issued payload are verified; full-access-key ownership is read at a final block.
- NEP-641 canonical Borsh + SHA3-256 envelope hashing, keyed authorization mapping through NEP-413, contract resolution, exact per-edge payload checks, bottom-up paths, and depth/node limits at one recent final block. Missing keys on existing accounts fail; only genuinely nonexistent Ed25519 implicit accounts may qualify through their deriving key in the NEP-641 path.
- Hashed opaque sessions, 15-minute expiry, Secure/HttpOnly/SameSite cookies, five-minute challenges, browser state cookie binding, exact-origin checks, CSRF checks, JSON/size limits, Redis rate limiting, rotation, and logout.
- Postgres migration for single-use challenges, sessions, treasury intents, and append-only authorization events. Challenge consumption and session/treasury creation share a transaction. Concurrent requests and idempotency conflicts fail closed.
- Treasury configuration signatures bind signer list, policy commitment, target contract account, type, and threshold. Creation produces an intent awaiting chain confirmation. It never creates an account or signs a deployment.
- Confirmation checks final deployed code against an explicit allowlist, no remaining access keys, matching contract configuration, and finalized init transaction outcome.
- Rust config contract: 1-of-1 individual and 2-of-3 team defaults are prepared by the API; the contract enforces valid thresholds, signer uniqueness/membership, approval uniqueness, bounded proposal expiry, current-version approval, and invalidation of stale proposals. NEP-641 view returns required member sub-authorizations.

## Contract interface in this milestone

| Method | Authority | Effect |
| --- | --- | --- |
| `new(kind, signer_accounts, threshold, policy_commitment, config_hash)` | Contract-account authority in a human-signed deploy/init batch | One-time initialization naming distinct governance signers; external initialization rejected |
| `get_config()` | Read-only | Public signer/threshold/commitment config |
| `get_policy_version()` | Read-only | Current governance revision |
| `list_proposal_ids()` / `get_proposal(proposal_id)` | Read-only | Review the exact proposed config, expiry, and approvals before signing |
| `propose_config(signer_accounts, threshold, policy_commitment, config_hash, expires_at_ns)` | Current member + 1 yoctoNEAR | Propose revision; proposer approval counted once |
| `approve_config(proposal_id)` | Current member + 1 yoctoNEAR | One approval per current signer |
| `execute_config(proposal_id)` | Current member + current threshold + 1 yoctoNEAR | Apply proposal and invalidate outstanding old approvals |
| `remove_stale_proposal(proposal_id)` | Current member + 1 yoctoNEAR | Clear expired proposal |
| `w_resolve_auth(path, authorization)` | Off-chain view only | Return threshold member authorization graph |

There is no settlement, quote acceptance, asset movement, relay call, pool, or cryptographic disclosure method in this contract. Those interfaces remain proposed until their respective design and approval gates.

## Verification

Run `npm test`, `npm run check:backend`, and `npm run check`. Backend suites use real generated Ed25519 signatures; named accounts in tests are fixture labels, never created network accounts. Test repositories and RPC doubles exist only in test files; production has no memory fallback.

The CI workflow runs real Postgres migration/concurrency tests and Rust unit/WASM builds. Local environment cannot run Postgres or Cargo and cannot reach the package registry through its current proxy. These tests must be reported separately from locally passed suites; a workflow file alone is not evidence of passing tests.

Observed local run: 27 authorization/encoding/RPC/session tests, 7 HTTP/contract-confirmation tests, and 2 Redis-boundary tests passed. Existing frontend syntax/domain checks also passed. Postgres transaction tests and Rust tests were not run locally.

## Pending external release gates

- Neon Postgres and Redis resources are not provisioned for Scrim. The connected Vercel API exposes inspection, but not Marketplace resource creation; local CLI installation cannot reach the proxy. Production API returns 503 until its dependencies are configured.
- Human-supplied testnet deployment and distinct treasury-owner account IDs are received and recorded in ignored local configuration. Both existed with zero balance and no contract at initial query. Human funding/signing and testnet deployment are pending. No account names, private keys, transaction signatures, or chain deployments have been generated.
- Testnet transaction/contract integration verification is pending. Milestone 1 is not release-complete until contract compilation, tests, deployment, and a real wallet round trip pass.
- First observed CI run on commit `e57b4241c40b1b65ac01d6bc8f90b474895ac251`: real Postgres migration and concurrency/rollback integration test passed; Rust contract unit tests passed. WASM build was still running at that observation. Later revisions must be checked independently.
- Confirmed CI on `af89a8f610a90ce2942ab45bb2537e3b795015cb`: backend, real Postgres concurrency tests, Rust unit tests, and WASM artifact build all passed in run `39835126480`. See `TESTNET_RELEASE.md` for the subsequent self-signer guard and unsigned artifact review procedure.
- Confirmed CI on `2fdd59a5dcf0252e007cb264a3986310cfe0bb58`: all 43 JavaScript tests, real Postgres integration, nine Rust tests, and WASM compilation passed in run `39837763837`. The constructor now requires contract-account transaction authority and rejects the contract as a governance signer. Both supplied accounts were subsequently funded with four test NEAR; signing remains human-only.
- Browser release preparation adds `/release/` with hash-verified local WASM/ZIP loading, exact account/config review, Meteor desktop/mobile connection paths, explicit wallet approval, and final-state verification. Fifty JavaScript tests and local Chromium checks at 390px/1440px passed. Actual user wallet approval and testnet deployment are still pending; this page does not complete the authenticated backend round trip.

## Deviations and limits

- Implementation is ESM JavaScript with explicit protocol TypeScript declarations, rather than a fully strict TypeScript application migration. The legacy frontend remains intact during backend work.
- Access-key signature support is Ed25519 initially. Secp256k1 keyed authorization is rejected; contract-wallet authorizations remain opaque and can use schemes enforced by their own reviewed contracts. Add native secp256k1 only with cross-implementation vectors.
- Treasury authentication uses standard NEP-641 recursive resolution; this contract adds threshold config governance only. It does not claim to be a full replacement for an audited treasury execution stack.
- The private Blob store is attached but is not a transactional database, and is not used to claim completed persistence. No plaintext financial records are stored there.
- Config proposal methods replace the earlier generic proposed names in `BACKEND_SPEC.md`; the concrete Milestone 1 ABI is listed above. Native pool and proof interfaces remain proposals.
- New backend paths are held on a review branch/PR while runtime and chain release gates are pending. Milestone 2 has not started.

# Human-owned accounts and release runbook

## Account inventory

The owner creates every account in a wallet, backs up recovery material privately, and supplies only public account IDs. Scrim never generates an account name, a private key, or an account-creation transaction.

Record these four IDs in deployment configuration, not in source examples:

- `DEPLOYMENT_ACCOUNT_ID`: mainnet contract release authority.
- `TREASURY_ADMINISTRATION_ACCOUNT_ID`: mainnet treasury administration.
- `PAYOUT_ACCOUNT_ID`: event payout only; may be provided before submission.
- `TESTNET_DEPLOYMENT_ACCOUNT_ID`: separately human-created testnet release authority.

All three mainnet roles must use distinct accounts. Keep the testnet release authority separate too. Mainnet deployment/upgrade operations require a human to review the WASM hash and sign in their wallet/hardware wallet. No backend stores a release key.

## Infrastructure setup

In the existing Scrim Vercel project, open Storage and connect a dedicated Neon Postgres database and Upstash Redis resource. Use separate resources/credentials for development, staging, and production. Do not share production data with previews. The existing private Blob store is for encrypted objects, not authentication, sessions, or transactional governance state.

Required environment variables are listed in `.env.example`. Never send raw secret values in chat. Provision them in the provider/Vercel secret settings. `SCRIM_ORIGIN` is the exact HTTPS application origin for that environment. Set network and RPC explicitly. Do not use preview hostnames with the production origin or database.

Run `npm install --ignore-scripts`, then `npm run db:migrate` against the selected database. This creates schema only. It does not create treasury accounts or submit chain transactions. Verify a second migration run is a no-op.

## Testnet release

1. Run CI backend tests with real Postgres and Rust contract tests. Review results and any deviations in `MILESTONE_0_1.md`.
2. Download the tested WASM artifact. Review its source, hash, contract interface, compiler/SDK versions, and network. A release must retain the tested Cargo.lock and dependency provenance.
3. The human creates the treasury contract account and signer accounts, supplies all public IDs, and funds its storage. The deployment account is release authority, not an extra governance signer.
4. An authorized human signs one deploy-and-init action batch with the contract account's deployment key. Initialization requires that authority, preventing an initialization race. Init arguments name distinct governance signers; the contract account cannot be its own signer. Defaults: individual 1-of-1, team 2-of-3.
5. Human removes access keys from the instantiated treasury contract account after checking its signers and threshold. Remaining keys bypass contract governance; the API rejects such a treasury. Do not lock a contract without verifying recovery/signers and storage funding first.
6. Add only the reviewed WASM code hash to `TREASURY_CODE_HASH_ALLOWLIST`. The API checks code, no remaining keys, full config, and final transaction outcome at chain confirmation.
7. Exercise signed login, treasury creation, config proposal, threshold approval, execution, expiry, and duplicate-approval rejection on testnet. Record transaction IDs, contract ID, WASM hash, network, and final block hashes.
8. Publish the milestone review. Do not proceed to agent execution, quotes, settlement, pool deployment, or proving in Milestone 1.

Contract accounts here are configuration authorities only. They do not accept deposits, move assets, invoke MPC, call relay targets, or accept quotes. Shielded-pool and proof interfaces stay proposed. Any future quote acceptance requires a fresh user signature even when an autonomous mandate exists.

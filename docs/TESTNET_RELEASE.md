# Human-reviewed testnet release

## Evidence and account roles

The owner supplied two distinct existing testnet accounts: deployment/contract and treasury owner. Their IDs are recorded in ignored `config/testnet.local.json`; no private keys are stored. `scripts/testnet-preflight.mjs CONTRACT_ACCOUNT OWNER_ACCOUNT` performs only final-block read queries and checks that the network is testnet.

CI on `2fdd59a5dcf0252e007cb264a3986310cfe0bb58` passed 43 JavaScript tests, real Postgres transaction integration, nine Rust unit tests, and WASM compilation in run [39837763837](https://github.com/Datwebguy/scrim/actions/runs/39837763837). This revision rejects self-governance and external initialization, requiring an atomic deploy/init batch signed by the contract account.

At the initial on-chain check both supplied accounts had zero test NEAR and no contract. A subsequent final-block check found four test NEAR in each account and no deployed contract. Never send mainnet funds to resolve a testnet setup issue. The community faucet at https://near-faucet.io/ has a NEAR selector, wallet-address field, and Request action.

The [reviewed artifact](https://github.com/Datwebguy/scrim/actions/runs/39837763837/artifacts/12451472003) manifest reports 345,452 WASM bytes, SHA-256 `188697aeb9656663606657926c9f469431128ea83f7cb43cb3e168a0b0c3dc95`, and NEAR code hash `2ejpWGN8wiwKQwN38QvYArV62NdDptQNyyuHC8QqgaFE`. Verify downloaded bytes independently before constructing the wallet request. CI log metadata alone does not establish local possession of the correct bytes.

The owner uses Meteor Wallet and is currently on a phone. Scrim must support mobile and desktop; the owner's current device only affects this administrative signing handoff. Never ask for a recovery phrase or private key, and do not split deployment from initialization to accommodate a wallet limitation.

### Meteor compatibility check (22 October 2026)

The published `@meteorwallet/sdk` latest version was 3.24.0 at inspection. Meteor's [current SDK guide](https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/f327864b7604b5824a714c9795899e2c6b26bfc4/packages/meteor-sdk-v1/README.md) documents desktop web/extension targets, a mobile bridge, and mainnet/testnet account identifiers. Its [connection manifest](https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/f327864b7604b5824a714c9795899e2c6b26bfc4/near-connect/manifest.json) advertises testnet and transaction signing.

The [mobile action adapter](https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/f327864b7604b5824a714c9795899e2c6b26bfc4/packages/meteor-sdk-v1/src/MeteorConnect/target_clients/mobile_bridge/sdkActionToMobileBridge.ts) encodes DeployContract bytes as base64 and FunctionCall arguments/gas/deposit, preserving each transaction's ordered action array and its signer/network. Its adapter tests include DeployContract and FunctionCall conversion. This supports constructing the required single deploy/init transaction, rather than two transactions.

The older NEAR Wallet Selector Meteor package inspected separately pins SDK 1.0.24. Do not assume its behavior equals the current SDK. Pin and verify the actual integration dependency before adding signing UI. Require wallet execution (`useFunctionCallKey: false`) and request no function-call access key for administrative signing. Mobile deep-link/popup behavior, installed wallet version/capabilities, actual WASM payload handling, cancellation, and finalized transaction results still require end-to-end verification. Source inspection is not a successful device test or permission to submit a transaction.

## Review package

The `treasury-policy-wasm` CI artifact contains:

- `scrim_treasury_policy.wasm`: code to deploy.
- `Cargo.lock`: dependencies resolved by the tested build.
- `release-manifest.json`: exact source commit, CI run, compiler, SDK, byte length, SHA-256 hex digest, and base58 NEAR code hash.

Confirm that the run succeeded, the artifact belongs to the reviewed source commit, and its manifest matches the artifact bytes. The manifest binds the downloaded file; it is not an independent audit or signature. A GitHub artifact archive digest is not the WASM code hash.

Generate the local unsigned review:

```sh
node scripts/prepare-testnet-release.mjs PATH_TO_WASM PATH_TO_MANIFEST CONTRACT_ACCOUNT OWNER_ACCOUNT
```

Supply the actual human-created account IDs. The command has no signer, private-key input, wallet call, RPC write, or transaction submission path. It prints these separate steps:

1. Human signs one action batch from the contract account to itself containing DeployContract and `new`, using exactly the manifest's WASM bytes and reviewed initialization arguments. Initialization requires the contract account's transaction authority to prevent a front-running initializer.
2. The init arguments name the distinct owner as the 1-of-1 governance signer. The deploying account cannot be its own governance signer. Review policy/config commitments and testnet network. Initial policy is a commitment to an inactive request-only configuration; this contract does not yet execute payments or agent policy.
3. Read `get_config` and `get_policy_version`, verify the expected owner and threshold, then exercise a separately human-signed config operation from the owner account.

Deployment and initialization must be one batch; the role separation is between deployment authority and the governance signers named in the init arguments. Do not remove keys until the distinct owner has been verified through a real signed governance operation. Key removal is a separate explicit human decision after recovery/access review.

The API does not report the treasury active while contract access keys remain. After the human lock-down step, reviewed code-hash allowlisting and final initialization confirmation are required.

## Browser release tool

`npm run build:release` bundles the pinned Meteor SDK into `dist/release/`. The `/release/` page supports desktop web/extension and the SDK's mobile bridge. Account fields start empty and require human-supplied, distinct testnet IDs. Upload the linked CI artifact ZIP or extracted WASM; unreviewed size/hash/header fails before wallet connection. Files are processed in the browser and are not uploaded to an API.

The browser computes the same policy/config commitments as the API, checks testnet and a recent final block, checks both account balances and deployment authority, and refuses to overwrite an existing contract. The review lists the exact signer, receiver, code hash, and initialization arguments. Human acknowledgement, connection to the exact deployment account, request preparation, and a separate wallet-approval button precede any signing request. Signing requests always use the wallet, with no requested function-call key. The action batch includes only DeployContract followed by `new`; there is no transfer or key deletion action.

After wallet return, the page checks finalized code, config, and policy version. It reports remaining access keys without deleting them or claiming the treasury is activated. Interrupted requests do not retry automatically. Verification is read-only; if no contract is found, reject any still-pending wallet request before preparing another.

Local verification: 50 JavaScript tests passed, including browser/backend commitment compatibility, artifact tampering, wrong wallet/network, role reuse, stale RPC, and on-chain config mismatches. Chromium at 390px and 1440px initialized the real SDK without page errors or horizontal overflow; unreviewed uploads left signing disabled. A real user wallet signing round trip remains pending.

Dependency scan: patched `fflate` to 0.8.3 and overrode the SDK's pinned `nanoid` to 5.1.16 to address reported advisories. SDK transitive URI-decoding and elliptic advisories remain for upstream review; do not downgrade the SDK to an obsolete release to silence a scan. This tooling is restricted to testnet and never receives recovery phrases or wallet private keys.

## Remaining Milestone 1 gates (current)

Testnet signing/deployment, isolated Neon/Redis provisioning, API environment binding, migration on that environment, and a real wallet authorization/treasury round trip remain pending. Milestone 2 must wait for the milestone report and review. Native pool/proof interfaces remain proposed, relay execution remains unavailable, and quote acceptance is never delegated away from fresh user authorization.

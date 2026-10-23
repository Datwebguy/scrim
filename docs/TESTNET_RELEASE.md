# Human-reviewed testnet release

## Evidence and account roles

The owner supplied two distinct existing testnet accounts: deployment/contract and treasury owner. Their IDs are recorded in ignored `config/testnet.local.json`; no private keys are stored. `scripts/testnet-preflight.mjs CONTRACT_ACCOUNT OWNER_ACCOUNT` performs only final-block read queries and checks that the network is testnet.

CI on `2fdd59a5dcf0252e007cb264a3986310cfe0bb58` passed 43 JavaScript tests, real Postgres transaction integration, nine Rust unit tests, and WASM compilation in run [39837763837](https://github.com/Datwebguy/scrim/actions/runs/39837763837). This revision rejects self-governance and external initialization, requiring an atomic deploy/init batch signed by the contract account.

At the initial on-chain check both supplied accounts had zero test NEAR and no contract. A subsequent final-block check found four test NEAR in each account and no deployed contract. Never send mainnet funds to resolve a testnet setup issue. The community faucet at https://near-faucet.io/ has a NEAR selector, wallet-address field, and Request action.

The [reviewed artifact](https://github.com/Datwebguy/scrim/actions/runs/39837763837/artifacts/12451472003) manifest reports 345,452 WASM bytes, SHA-256 `188697aeb9656663606657926c9f469431128ea83f7cb43cb3e168a0b0c3dc95`, and NEAR code hash `2ejpWGN8wiwKQwN38QvYArV62NdDptQNyyuHC8QqgaFE`. Verify downloaded bytes independently before constructing the wallet request. CI log metadata alone does not establish local possession of the correct bytes.

The owner uses Meteor Wallet and is currently on a phone. Scrim must support mobile and desktop; the owner's current device only affected this administrative signing handoff. Do not split deployment from initialization to accommodate a wallet limitation. Meteor's actual approval screen blocked the app's DeployContract action. After the owner explicitly authorized local execution and supplied testnet credentials, the atomic batch was signed from this workspace. Neither credential was printed or committed; both should be rotated because they were shared as an attachment.

### Meteor compatibility check (22 October 2026)

The published `@meteorwallet/sdk` latest version was 3.24.0 at inspection. Meteor's [current SDK guide](https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/f327864b7604b5824a714c9795899e2c6b26bfc4/packages/meteor-sdk-v1/README.md) documents desktop web/extension targets, a mobile bridge, and mainnet/testnet account identifiers. Its [connection manifest](https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/f327864b7604b5824a714c9795899e2c6b26bfc4/near-connect/manifest.json) advertises testnet and transaction signing.

The [mobile action adapter](https://github.com/Meteor-Wallet/meteor_wallet_sdk/blob/f327864b7604b5824a714c9795899e2c6b26bfc4/packages/meteor-sdk-v1/src/MeteorConnect/target_clients/mobile_bridge/sdkActionToMobileBridge.ts) encodes DeployContract bytes as base64 and FunctionCall arguments/gas/deposit. That source-level capability did **not** mean Meteor would permit the action: the real wallet displayed “Contract deployment blocked” and disabled Approve.

The older NEAR Wallet Selector Meteor package inspected separately pins SDK 1.0.24. Do not assume its behavior equals the current SDK. The app signing button and Meteor SDK were removed from the release page after the observed wallet policy block. No retry loop or alternate encoding may be used to work around this wallet policy.

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

`npm run build:release` builds the `/release/` review page for mobile and desktop. Account fields start empty and require human-supplied, distinct testnet IDs. Upload the linked CI artifact ZIP or extracted WASM; unreviewed size/hash/header fails. Files are processed in the browser and are not uploaded to an API.

The browser computes the same policy/config commitments as the API, checks testnet and a recent final block, checks both account balances and deployment authority, and refuses to overwrite an existing contract. The review lists the exact signer, receiver, code hash, and initialization arguments. The browser cannot sign or submit. The direct signer described in [DIRECT_TESTNET_DEPLOYMENT.md](DIRECT_TESTNET_DEPLOYMENT.md) uses the same pinned artifact, checks a matching full-access public key, and requires a local human confirmation before submitting one transaction with DeployContract followed by `new`. There is no transfer or key deletion action.

After the direct sender returns, the page checks finalized code, config, and policy version. It reports remaining access keys without deleting them or claiming the treasury is activated. Neither path retries automatically. Verification is read-only.

Local verification: 52 JavaScript tests passed, including browser/backend commitment compatibility, artifact tampering, role reuse, stale RPC, direct action order/full-access-key enforcement, and on-chain config mismatches. The old Meteor approval path was blocked in a real wallet. The owner subsequently authorized execution from the workspace; deployment and governance verification are recorded below.

Dependency scan: patched `fflate` to 0.8.3 and removed the Meteor SDK from this administrative page. The direct signer is restricted to testnet and does not take keys through arguments, files, the browser, or a Scrim server. The user must export their own key locally if they choose this route; the agent never handles it.

## Finalized testnet evidence (23 October 2026)

- `scrim.testnet` signed one transaction with DeployContract followed by `new`: `9x3fWwMQd6EgsyEdswxTY3zKSJvrN88JWxwNUTc6n7f2`. Finalized code hash is `2ejpWGN8wiwKQwN38QvYArV62NdDptQNyyuHC8QqgaFE`, exactly the reviewed artifact. Initial owner was `scrimtest.testnet`, threshold 1-of-1, policy version 1.
- `scrimtest.testnet` proposed the same inactive configuration in finalized transaction `B8RByXYLiXmXn6nfREWGWHMSMtewGtgTPbuHYwTNXKB9`, then executed it in finalized transaction `mAwKuX4S3VeYaeizog8Gqp3i2dKTNJrez7wh32nGhrC`. Final policy version is 2, the config is unchanged, and no proposal remains. This verifies separate owner governance without enabling payment execution.
- A later final-block read at `4oiXWPgBpT35FEt6TukcQEb4veMkEVKkXACc6TYyQnX2` showed the reviewed contract code on `scrim.testnet` and one remaining full-access key on each account. The deployment account has **not** been made keyless. This means the API's treasury-activation check must still fail closed.

## Remaining Milestone 1 gates (current)

Key rotation/recovery planning and a separate decision about deployment-account access-key removal, isolated Neon/Redis provisioning, API environment binding, migration on that environment, and a real wallet authorization/treasury API round trip remain pending. Do not remove the deployment key without a recovery review: the account retains test NEAR and the policy contract has no key-recovery or upgrade path. Milestone 2 must wait for the milestone report and review. Native pool/proof interfaces remain proposed, relay execution remains unavailable, and quote acceptance is never delegated away from fresh user authorization.

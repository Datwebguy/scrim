# Human-reviewed testnet release

## Evidence and account roles

The owner supplied two distinct existing testnet accounts: deployment/contract and treasury owner. Their IDs are recorded in ignored `config/testnet.local.json`; no private keys are stored. `scripts/testnet-preflight.mjs CONTRACT_ACCOUNT OWNER_ACCOUNT` performs only final-block read queries and checks that the network is testnet.

CI on `af89a8f610a90ce2942ab45bb2537e3b795015cb` passed the backend suites, real Postgres transaction integration, Rust unit tests, and WASM compilation in run [39835126480](https://github.com/Datwebguy/scrim/actions/runs/39835126480). A subsequent revision adds direct self-signer rejection and release manifests; use only its freshly tested artifact for deployment.

At the initial on-chain check both supplied accounts had zero test NEAR and no contract. Fund them using test tokens before deployment. Never send mainnet funds to resolve a testnet setup issue. The community faucet at https://near-faucet.io/ has a NEAR selector, wallet-address field, and Request action.

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

1. Human signs a DeployContract action from the contract account to itself, using exactly the manifest's WASM bytes.
2. Human signs `new` from the distinct owner account to the contract account. Review 1-of-1 owner, policy/config commitments, and testnet network. Initial policy is a commitment to an inactive request-only configuration; this contract does not yet execute payments or agent policy.
3. Read `get_config` and `get_policy_version`, verify the expected owner and threshold, then exercise a separately human-signed config operation.

Do not combine deployment and initialization as a contract-account-signed transaction: the signer would be the contract itself, defeating owner role separation. Do not remove keys until the distinct owner has been verified through a real signed governance operation. Key removal is a separate explicit human decision after recovery/access review.

The API does not report the treasury active while contract access keys remain. After the human lock-down step, reviewed code-hash allowlisting and final initialization confirmation are required.

## Remaining Milestone 1 gates

Testnet signing/deployment, isolated Neon/Redis provisioning, API environment binding, migration on that environment, and a real wallet authorization/treasury round trip remain pending. Milestone 2 must wait for the milestone report and review. Native pool/proof interfaces remain proposed, relay execution remains unavailable, and quote acceptance is never delegated away from fresh user authorization.

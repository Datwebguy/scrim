# Direct testnet deployment

Meteor Wallet's approval screen blocks `DeployContract` actions requested by apps. Its displayed Approve button is disabled; retrying the Scrim page cannot deploy the contract. This is a wallet policy. The Scrim release page remains useful for reviewing the artifact and verifying the final chain state. **The reviewed contract was deployed to `scrim.testnet` on 23 October 2026; do not rerun these deployment steps against that account.**

The approved treasury constructor requires a single transaction **signed by `scrim.testnet`** with these ordered actions: DeployContract of the reviewed WASM, then FunctionCall `new` naming the separate owner `scrimtest.testnet`. Splitting those actions is unsafe and will fail. Do not use another account as the transaction signer.

The repository includes `scripts/deploy-direct-testnet.mjs` for a direct, owner-operated path on Android with Termux or on a desktop terminal. It runs on the device you control, reads the exported **private key for `scrim.testnet` only** through hidden terminal input, verifies that its public key is a current full-access key, and never sends the key to Scrim or GitHub. Exporting a wallet key is sensitive: use a device you trust, avoid screen sharing, and do not enter the key in a web page, chat, issue, screenshot, or cloud terminal. The script does not accept a private key in an argument, environment variable, or file. Meteor's [Security and Recovery settings](https://help.meteorwallet.app/en/articles/17-how-to-have-complete-control-with-meteor-wallet) describe its private-key export option. Keep the recovery phrase private.

## Prepare on either device

1. Download the [`treasury-policy-wasm` artifact](https://github.com/Datwebguy/scrim/actions/runs/39837763837/artifacts/12451472003) from the successful CI run. Unzip it locally. GitHub may require you to sign in. The two needed files are `target/wasm32-unknown-unknown/release/scrim_treasury_policy.wasm` and `release-manifest.json` inside the extracted folder.
2. Install Node.js 24 and Git on the device. Clone the reviewed branch:

   ```sh
   git clone --branch backend/milestones-0-1 https://github.com/Datwebguy/scrim.git
   cd scrim
   npm ci --ignore-scripts
   ```

3. Run the read-only review, replacing `/path/to/extracted-artifact` with the actual extracted folder:

   ```sh
   node scripts/deploy-direct-testnet.mjs /path/to/extracted-artifact/target/wasm32-unknown-unknown/release/scrim_treasury_policy.wasm /path/to/extracted-artifact/release-manifest.json scrim.testnet scrimtest.testnet
   ```

   The review prints testnet, both account roles, final block, WASM hashes, and both transaction actions. It cannot request a key or sign without `--send`.

## Android phone

Use a local Android terminal such as [Termux from its official project](https://github.com/termux/termux-app). Inside Termux, install `nodejs`, `git`, and `unzip` using `pkg install nodejs git unzip`, then check that `node --version` is at least 24. `termux-setup-storage` grants access to Downloads so the CI artifact ZIP can be extracted into the Termux home directory. The exact Downloads path depends on your phone. Run the preparation commands above inside Termux. The direct signer itself is the same on Android and desktop.

## Send from Android or desktop

When the read-only review matches the intended accounts and artifact, run the same command with `--send` appended:

```sh
node scripts/deploy-direct-testnet.mjs /path/to/extracted-artifact/target/wasm32-unknown-unknown/release/scrim_treasury_policy.wasm /path/to/extracted-artifact/release-manifest.json scrim.testnet scrimtest.testnet --send
```

The script rechecks the artifact and chain, then prompts for the exported `scrim.testnet` private key with terminal echo disabled. It checks that key against the final testnet access-key list, prints the public-key check, and asks you to type `DEPLOY scrim.testnet`. Only that exact response signs and submits the transaction. On Android, clear the clipboard after pasting the key into the local terminal. Never send the key or recovery phrase to us.

If the script reports an uncertain outcome, **do not immediately repeat `--send`**. Open the current Scrim release preview linked from the pull request, enter the two account IDs, and use **Verify deployment on testnet**. The finalized deployment has the reviewed code hash, `scrimtest.testnet` as owner, threshold 1-of-1, and policy version 2 after the separate owner-governance check. A still-pending transaction can finalize after a read; check its hash or a later final block before attempting anything else.

The owner governance round trip is verified. Deployment-account access-key lockdown requires a separate recovery review. This deployment does not enable payments, agents, shielded balances, or proofs. Milestone 1 remains open for the authenticated backend and account-security gates described in [TESTNET_RELEASE.md](TESTNET_RELEASE.md).

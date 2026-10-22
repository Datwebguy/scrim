# Engineering instructions for Scrim

Build long-term private payment and treasury infrastructure for people and AI agents. Design for security, real volume, and years of operation. The hackathon is an optional deployment milestone, not the architecture boundary.

Read `PRODUCT.md`, `BACKEND_SPEC.md`, `NEAR_TOOLS.md`, `ARCHITECTURE.md`, and current milestone evidence before edits. The approved backend decisions and later user constraints take precedence over proposed interfaces.

## Architecture

1. Native shielded notes hold owner key, amount, asset, and randomness under Merkle commitments. Nullifiers prevent double spends.
2. Pool interfaces are proposed shield/transact/unshield operations. Do not finalize them before actual circuit/public-input design.
3. A restricted relay binds the exact call commitment and a strict allowlisted target. Never allow arbitrary external calls. Design asynchronous receipt failure/recovery explicitly.
4. Device-generated solvency, receipt, and payroll-total disclosures are bound to reader public key, nonce, expiry, statement commitment, and verification-key version. Recheck the exact bindings when circuits exist.
5. Use NEAR Intents, Confidential Intents, Chain Signatures, and NEAR AI Cloud for their existing capabilities. Verify actual API/access/attestation and privacy guarantees before implementation claims.
6. Launch USDC NEAR to USDC Base via the confidential path first. Develop/audit the native pool in parallel for full production. Expand corridors only after reliability/reconciliation gates.
7. Agent mandates enforce spending and counterparty limits, disclosure permissions, pause and owner recovery. Request-only is the default; autonomy is later explicit opt-in. Quote acceptance always requires fresh user authorization, including after autonomy.
8. Treasury governance defaults to 1-of-1 individual and 2-of-3 team. Higher thresholds, bulk payments, confidential receipts, exports, hardware signing, roles, and multiple treasuries belong in the complete product.

## Constraints

- User keys/witnesses remain off server; encrypted record storage is not financial truth.
- Public roles and commitments are separated from private balances/counterparties.
- First proof readers: payroll recipients, vendors, auditors/internal finance.
- Mainnet deployment, treasury administration, and payout accounts are distinct and human-created. Never invent account IDs, create accounts, generate role keys, or sign transactions for the owner.
- Homepage illustrations never consume connected user data. Wallet and financial state belong only in the workspace.
- Keep private external research/competitor names, architectures, and links outside the public repository, README, UI, and backend. Do not copy those into release artifacts.
- Report actual tests, infrastructure state, missing credentials/tooling, and deviations. Documentation or a passing mock test is not evidence of live deployment.
- After Milestone 1, report contract interfaces, authorization tests, and deviations before Milestone 2.

Primary integration sources: https://docs.near.org, https://docs.near-intents.org, https://docs.near.ai, https://business.near.com, https://nearhackathon.com, https://nearhackathon.com/HACKATHON.md.

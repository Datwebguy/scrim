# Scrim architecture

> Implementation status: the Phase A control plane (identity, treasuries, agent mandates, approvals, Intents quotes) is built. The shielded-value and proof layers below are designed but not implemented. See BACKEND_SPEC.md §17.

Scrim separates sealed value from public coordination. The browser and proving runtime own private keys, notes, witnesses, amounts, and proof inputs. NEAR contracts own only commitments, nullifiers, policy commitments, roles, thresholds, and the minimum settlement state required to prevent double-spends and coordinate approved outcomes.

## Shielded value layer

Balances are UTXO-style encrypted notes. A note contains an owner public key, token identifier, amount, randomness, and commitment. Commitments enter an append-only Merkle tree. A spend creates a nullifier derived from the spending key and note path; contracts reject a repeated nullifier without learning which note was spent.

The pool surface is deliberately small:

- `shield`: deposit a supported public asset and mint a note commitment.
- `transact`: verify a proof, reject spent nullifiers, append output commitments, and update the root.
- `unshield`: consume a note under a proof and release the specified public output.
- `relay`: atomically unshield, execute a bounded external call, and re-shield remaining value.

Private inputs and witnesses never enter an API route. Client proving must occur on the device or through an approved attested execution environment.

## Proof layer

Three device-generated proof families are required:

1. Solvency: sealed balance is at least a stated threshold.
2. Receipt: a selected payment was completed.
3. Payroll: a batch has the stated total and recipient count.

Each statement carries a reader public key, nonce, proof type, and expiry. Verification checks the public verification key, intended reader, statement binding, and expiry. Expiry is enforced by the verifier, not treated as a display preference.

## Policy and agent layer

Agent policies are committed before an agent can request a payment. A policy contains cumulative and per-action limits, an approved-counterparty set, disclosure permissions, approval threshold, expiry limits, owner recovery authority, and a version. The policy evaluator runs before an intent becomes eligible for settlement. Contract policy commitments make limits enforceable rather than advisory.

## Treasury and governance layer

Treasury contracts use thresholded, role-based approvals. Governance data can be public and verifiable while note ownership, balances, counterparties, and payment detail remain sealed. The treasury layer provides bulk payment construction, named-recipient verification, hardware signing support, multi-treasury views, and authorized CSV, Excel, and JSON exports.

## Settlement layer

Approved outcomes are expressed as NEAR Intents. Solvers fulfill the route. Where a destination chain requires an account signature, Chain Signatures supplies it through MPC. Confidential execution remains in the confidential intent path; the public settlement record contains only what execution requires. The application must use adapter interfaces for Intents and destination-chain signing rather than rebuild either primitive.

## Service boundaries

| Boundary | Owns | Must never receive |
| --- | --- | --- |
| Client + prover | keys, notes, witnesses, amounts, proof inputs | server custody of the owner key |
| Shielded-pool contract | commitments, roots, nullifiers, verification keys | plaintext notes or private witnesses |
| Treasury contract | roles, thresholds, policy commitments | sealed balances or counterparties |
| Settlement adapter | approved intent outcome and routing metadata | private keys, note witnesses, unrestricted policy state |
| Record store | encrypted audit envelopes and encrypted exports | decryptable private financial state |

## Delivery sequence

1. Wallet-authenticated treasury identity and contract-backed policy commitments.
2. Note commitment, nullifier, Merkle-root, and verifier contract interfaces.
3. Device-side circuit/proving package and reader-bound proof verifier.
4. Intent and Chain Signature settlement adapters.
5. Treasury approval, payroll, export, and agent execution workflows.

No production release should claim shielded transfers, private settlement, or cryptographic disclosure until the corresponding contract, circuit, wallet-signing path, and independent security review are complete.

# Scrim product definition

## What this is

Scrim is a long-term product for private payments and treasuries used by people and AI agents. It is infrastructure intended for real users, real volume, and adoption on NEAR over years. A hackathon is an optional early milestone, not its product boundary.

The complete product combines:

1. A shielded pool where balances are encrypted notes represented by commitments, keeping private sender, recipient, and amount details out of public state.
2. Cross-chain settlement through NEAR Intents and Chain Signatures, using existing settlement/signing primitives rather than rebuilding them.
3. Device-generated selective disclosures, revealing one fact to one named reader within an explicit validity window.

Privacy and accountability must coexist. Payroll, treasury operations, and agent commerce require evidence without publishing complete financial history.

## Problem

Public transaction records expose salaries, supplier relationships, treasury balances, headcount signals, and runway. Agents on transparent rails additionally reveal their budgets, strategy, and counterparties. Scrim combines private value, treasury governance, and agent constraints in one operating model.

## Core mechanics

### Shielded pool

Balances are UTXO-style encrypted notes containing owner public key, amount, token identifier, and randomness. Commitments live in an append-only Merkle tree. Spending produces a nullifier to prevent reuse while concealing the spent note. Deposits mint notes; transfers consume inputs and create outputs; withdrawals consume notes and release an authorized public output. Exact nullifier derivation, circuit public inputs, tree parameters, and verification methods remain proposed until the circuit design and independent review are complete.

The proposed pool surface contains `shield`, `transact`, and `unshield`. `transact` verifies the conservation and authorization proof, checks roots/nullifiers, and appends output commitments.

### Private-to-public interaction

A restricted relay is intended to unshield for an exact approved external call and re-shield the remainder. Targets stay on a strict allowlist. Authorization binds the exact call commitment; arbitrary external calls are forbidden. Atomicity and failure recovery must be designed for the actual chain execution model rather than assumed.

### Selective disclosure

Three initial proof families:

- Solvency: balance is above a stated threshold.
- Receipt: a particular payment was made.
- Payroll total: a batch has a stated sum and recipient count.

Every proof binds reader public key, nonce, expiry, verification-key reference, and statement commitment. Exact binding is rechecked against actual circuit/public inputs. Device-side proving keeps private keys, witnesses, and underlying private amounts off the server. An authorized reader verifies a proof against a public verification key. Expiry limits acceptance, not the reader's ability to remember previously disclosed information. Single-use requires explicit replay enforcement.

First readers are payroll recipients, vendors, and auditors/internal finance. Lenders and external compliance readers follow after the schema stabilizes.

### Cross-chain settlement

Launch with Confidential Intents as the initial private execution and settlement path. The native pool is a full-production requirement developed and audited in parallel, not a blocker to initial user settlement. Once available, eligible paths migrate to the pool while Confidential Intents remains a parallel/fallback path.

The first corridor is USDC on NEAR to USDC on Base. Arbitrum and Ethereum follow after Base is stable. Users express the desired outcome, solvers quote, and the user accepts the exact quote through fresh authorization. Chain Signatures supplies destination signatures where required, using distinct derivation paths and chain-specific payloads. Actual destination privacy must be demonstrated per route.

### Agent rails

Each agent has caps, approved counterparties, proof-generation permissions, expiry limits, and human override/recovery. Limits must be enforced independently of the UI. Agents default to request-only: prepare intents, attach allowed proof metadata, and propose settlement. Human or multisig acceptance precedes execution. Autonomous execution is an explicit later opt-in per agent. Quote acceptance still requires fresh user authorization even after autonomy is added.

### Treasury layer

Individuals default to 1-of-1, teams to 2-of-3, with configurable higher team thresholds. The target treasury experience includes confidential receipts, bulk payments/payroll, CSV/Excel/JSON audit exports, Ledger hardware signing, named verified recipients, multiple treasuries, and configurable roles. Public governance may expose roles, thresholds, and commitments while financial state stays sealed.

## Design principles

- Privacy by default, deliberate selective disclosure.
- Reader and expiry binding on every proof.
- Client-held keys; approved TEE assistance where appropriate.
- Minimal public settlement metadata.
- Enforceable limits and clear private/public state separation.
- Use NEAR's existing Intents, signing, inference, and governance primitives.
- No financial truth inferred from UI or server records; confirmed chain state and verified proofs govern the relevant transitions.

## Public experience

The homepage explains the product with independent illustrations/animations. It never loads a connected user's portfolio, wallet identity, balances, payment history, or treasury data. Actual data belongs in the authenticated workspace. Implemented capabilities and pending infrastructure must be reported accurately in technical release notes.

## Account ownership

Deployment, treasury administration, and payout accounts are separate and human-created. No agent invents account names, generates these accounts, holds their private keys, or signs/deploys chain transactions on the owner's behalf without the required human review.

## Research boundary

External project comparisons, research architectures, circuits, SDK patterns, and competitor links remain in private research notes. They must not be published in the repository, README, UI, or backend. Official NEAR integration documentation remains available as technical evidence.

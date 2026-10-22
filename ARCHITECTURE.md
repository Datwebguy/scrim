# Scrim architecture

## Trust boundaries

Private balances, payment details, proof witnesses, keys, and policy inputs stay on the user or agent side. The public settlement layer receives only the minimum data needed to settle an approved intent. A proof discloses one statement to one named reader and carries an explicit expiry.

## Product layers

1. The client manages local keys, private state presentation, proof requests, and human approvals.
2. The policy engine evaluates hard caps, counterparty allowlists, approval thresholds, and proof permissions before an action can proceed.
3. Proving adapters produce recipient-bound, expiring proofs on-device or in an approved TEE.
4. Settlement adapters translate approved payment intents into NEAR Intents and use Chain Signatures when a destination-chain signature is required.
5. Treasury contracts enforce team approvals and keep immutable policy references without publishing sensitive payment metadata.
6. Audit exports are encrypted to an authorized organization key and generated only on deliberate request.

## First slice

The current static application implements the interaction model and pure policy/proof domain functions. It uses local demo state and does not sign transactions, generate cryptographic proofs, or move funds. The next backend slice should introduce versioned adapter interfaces, an append-only encrypted event store, and contract-backed policy commitments before any live settlement is enabled.

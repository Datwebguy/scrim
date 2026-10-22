# Scrim contracts

This directory is reserved for the audited NEAR contract suite.

## Required contracts

### Shielded pool

Stores commitment roots, nullifiers, asset configuration, verification keys, and public withdrawal outputs. It must not store plaintext note contents, private witnesses, or user private keys.

### Treasury policy

Stores treasury roles, thresholds, policy commitment hashes, recovery roles, and approval state. It authorizes settlement only after the policy and threshold conditions are satisfied.

### Relay executor

Executes a bounded public call from an approved private-to-public interaction, then requires the remaining value to return to the shielded pool in the same atomic flow.

## Security gates

- Contract state-transition tests for every note lifecycle.
- Nullifier replay tests.
- Merkle root and verification-key rotation tests.
- Role and threshold authorization tests.
- Formal circuit/contract public-input compatibility tests.
- Independent audit before mainnet custody.

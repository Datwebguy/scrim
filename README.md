# Scrim

Scrim is private payment and treasury infrastructure for people and AI agents on NEAR.

It combines shielded-note balances, reader-bound expiring disclosures, intent-based cross-chain settlement, enforceable agent rails, and threshold treasury approvals.

## Product capabilities

- Shielded UTXO-style notes with commitments, Merkle roots, and double-spend nullifiers.
- Solvency, receipt, and payroll-total disclosures bound to one reader and an expiry.
- Cross-chain outcomes through NEAR Intents and Chain Signatures.
- Agent payment policies: caps, counterparties, approval escalation, and disclosure permissions.
- Treasury approvals, bulk payments, audit exports, and multi-treasury operations.

## Repository map

- `dist/` — responsive product website and workspace.
- `api/` — Vercel service endpoints, including live NEAR mainnet account lookup.
- `ARCHITECTURE.md` — contract, proof, policy, settlement, and trust boundaries.
- `PRODUCT.md` — product definition.
- `NEAR_TOOLS.md` — NEAR primitives used by Scrim.
- `RESEARCH.md` — internal research notes.

## Run

```sh
npm test
npm run check
python3 -m http.server 4173 --directory dist
```

Open `http://localhost:4173`.

## Development path

The architecture is designed around client-held keys, contract-verified commitments and nullifiers, device-side proving, NEAR Intents settlement, Chain Signatures, and threshold treasury contracts. See [ARCHITECTURE.md](ARCHITECTURE.md) for the required boundaries and delivery sequence.

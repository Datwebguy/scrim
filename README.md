# Scrim

Scrim is private payment and treasury infrastructure for people and AI agents. This repository currently contains the first product slice: a responsive treasury interface, enforceable client-side policy rules, and expiring selective disclosure proof records.

## Run locally

Serve `dist/` with any static HTTP server. For example:

```sh
python3 -m http.server 4173 --directory dist
```

Then open `http://localhost:4173`.

## Verify

```sh
npm test
npm run check
```

## Current boundary

Payment intents and proofs are simulated locally in this first slice. The UI and domain rules are structured around adapters so shielded state, proof generation, NEAR Intents settlement, and Chain Signatures can be connected without moving private data into view components.

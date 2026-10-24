# Scrim

Private treasury rails for people, teams, and the AI agents that work for them, on NEAR.

Agents request payments under a **versioned spending mandate**. The policy engine checks every request
before a person sees it. Signers **approve from their own NEAR wallet**, and each signature commits to
the exact amount, recipient, and request. Settlement is quoted live through **NEAR Intents**
(USDC on NEAR → USDC on Base). Scrim never holds a private key.

## What works today

| Capability | Status |
| --- | --- |
| Wallet sign-in (NEP-413 signature + on-chain full-access-key check) | ✅ Live |
| Individual (1-of-1) and team (M-of-N) treasuries | ✅ Live |
| Agents with hashed API keys and versioned mandates (per-action cap, rolling cap, counterparty allowlist, expiry, pause) | ✅ Live |
| Server-side policy enforcement, serialized per agent so parallel requests cannot overspend | ✅ Live |
| Wallet-signed threshold approvals bound to a request commitment | ✅ Live |
| Live NEAR Intents (1Click) exact-output quotes, USDC NEAR → Base | ✅ Live (indicative) |
| Append-only audit log | ✅ Live |
| Deposit execution from the signer's wallet, plus a finality watcher | 🚧 Next |
| On-chain treasury-policy contract | 🚧 Next |
| Reader-bound, expiring disclosure proofs | 🔬 Research |
| Shielded note pool | 🔬 Research |

Scrim makes no claim about shielded balances or cryptographic disclosures until the circuits and contracts
exist and an independent review has passed. See [BACKEND_SPEC.md](BACKEND_SPEC.md) §17.

## Quick start

Requirements: Node 20+ and Postgres 14+.

```sh
cp .env.example .env.local          # then edit as needed
createdb scrim                      # or point DATABASE_URL at any Postgres
npm install
npm run db:migrate
npm run dev                         # http://localhost:3000
```

Sign in at `/app` with any NEAR testnet wallet (HOT, Meteor, Intear, MyNearWallet, and others) through
[NEAR Connect](https://www.npmjs.com/package/@hot-labs/near-connect). Set `NEXT_PUBLIC_NEAR_NETWORK=mainnet` for mainnet.

```sh
npm test            # protocol unit tests + backend integration tests (needs a scrim_test database)
npm run typecheck
npm run build
```

The tests use `TEST_DATABASE_URL`, which defaults to `postgres://scrim:scrim@localhost:5432/scrim_test`.
They **drop and recreate** the schema in that database.

## Agent API

An owner creates an agent in the workspace and receives its API key once. Scrim stores only a hash of the key.

```sh
# Read the active mandate and remaining budget
curl https://<host>/api/v1/agent -H "Authorization: Bearer $SCRIM_AGENT_KEY"

# Request a payment. It is evaluated against the mandate, then waits for human approval.
curl -X POST https://<host>/api/v1/agent/payments \
  -H "Authorization: Bearer $SCRIM_AGENT_KEY" \
  -H "Idempotency-Key: inv-1048" \
  -H "Content-Type: application/json" \
  -d '{"recipient":"0x7a3f…c291","amount":"420.00","memo":"GPU hours"}'

# List this agent's requests and their status
curl https://<host>/api/v1/agent/payments -H "Authorization: Bearer $SCRIM_AGENT_KEY"
```

Responses include `status` (`awaiting_approval` or `policy_rejected`), the full `policyDecision` with each
check, and the request `commitment`. Repeating an `Idempotency-Key` returns the original request. Reusing it
for a different request returns `409`.

## Layout

```
app/                 Next.js routes: homepage, /app workspace, /api/v1 endpoints
src/protocol/        Pure, tested logic shared by server and browser:
                     amounts, canonical commitments, NEP-413, mandate policy engine, corridors
src/server/          Auth/sessions, treasuries, agents, payments, approvals, settlement adapter, audit
src/client/          Browser API client and wallet bridge (NEAR Connect)
src/components/      Workspace UI
db/migrations/       SQL schema
tests/               Vitest: protocol + backend integration
contracts/           Reserved for the NEAR contract suite
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `NEXT_PUBLIC_NEAR_NETWORK` | `testnet` (default) or `mainnet` |
| `NEAR_RPC_URL` | Optional RPC override (defaults to FastNEAR) |
| `SCRIM_AUTH_RECIPIENT` | NEP-413 recipient bound into every signed message. Set it to your production host. |
| `ONECLICK_JWT` | Optional 1Click key. When set, quotes request the confidential Intents path. |

On Vercel, `vercel-build` runs migrations whenever `DATABASE_URL` is set, then builds.

## Documents

- [BACKEND_SPEC.md](BACKEND_SPEC.md): backend contract, threat model, delivery plan, implementation status
- [ARCHITECTURE.md](ARCHITECTURE.md): layers and trust boundaries
- [PRODUCT.md](PRODUCT.md): product definition
- [NEAR_TOOLS.md](NEAR_TOOLS.md): the NEAR primitives Scrim builds on

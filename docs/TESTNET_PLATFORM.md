# Scrim testnet platform release

Scrim's NEAR testnet policy contract is deployed at the human-created `scrim.testnet` account. Its on-chain owner is the distinct `scrimtest.testnet` account. The reviewed code hash is `2ejpWGN8wiwKQwN38QvYArV62NdDptQNyyuHC8QqgaFE`; the inactive policy is at version 2. The deployed contract governs configuration only. It cannot hold shielded balances, settle an intent, pay a counterparty, or generate a disclosure proof.

The web app is hosted on Vercel. Its same-origin `/api/v1/*` Functions pass selected request headers to a private Scrim API service in the isolated Railway `scrim-testnet` project. A shared proxy secret is required before the backend processes any request. The backend uses Railway Postgres for single-use challenges, sessions, treasury configuration intents and authorization events, plus Redis for atomic rate limits. Its startup applies versioned SQL migrations before accepting traffic. `/api/health` reports online only after Postgres, Redis and a final NEAR testnet block respond.

The browser connects Meteor on **testnet**, obtains a NEP-413 challenge from the API, asks Meteor to sign it, and sends the signature back for final-block full-access-key verification. The short-lived session is an HttpOnly cookie; the CSRF token stays in the tab. A connected owner can inspect the actual finalized contract policy and sign a separate configuration intent. The current deployment account still has one full-access key, so treasury activation deliberately fails closed. There is no payment or proof submission button before enforcement exists.

Runtime environment names, with values injected by their respective platforms:

| Railway API | Vercel Functions |
| --- | --- |
| `SCRIM_NETWORK=testnet` | `SCRIM_API_UPSTREAM` |
| `SCRIM_ORIGIN` (the final Vercel origin) | `SCRIM_PROXY_SECRET` |
| `NEAR_RPC_URL=https://rpc.testnet.near.org` | |
| `DATABASE_URL` from Railway Postgres | |
| `REDIS_URL` from Railway Redis | |
| `TREASURY_CODE_HASH_ALLOWLIST` | |
| `SCRIM_PROXY_SECRET` | |

Do not commit credentials, use exposed wallet keys for production, or remove the contract account's last key without a recovery and remaining-funds decision. A new mainnet deployment requires its own audit and rollout. No mainnet settlement is claimed by this testnet release.

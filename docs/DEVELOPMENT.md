# Development

## Project layout

```
app/              pages and API routes (home, /app, /pay, /verify, /api)
src/protocol/     logic shared by server and browser: amounts, signatures, proofs, spending limits
src/server/       sign-in, private access, transfers, links, proofs, accounts, agents, alerts
src/client/       browser wallet bridge and API helpers
src/components/   screens
db/migrations/    database schema, applied in order
tests/            protocol tests, security regression tests and live tests against real networks
docs/             product, architecture and backend notes, brand files, screenshots
scripts/          migrations, key generation and key changes
```

## Commands

```sh
npm run dev         # run locally
npm run typecheck   # TypeScript
npm run unused      # find unused code and dependencies
npm test            # tests
npm run check       # all three
npm run build       # production build
```

Tests use real services: NEAR testnet and mainnet RPC, NEAR Intents, CoinGecko. They create real testnet accounts and send real testnet NEAR, so they need internet access. They reset the database named by `TEST_DATABASE_URL` (default `scrim_test`). Three mainnet tests that request private transfer quotes run only when `ONECLICK_API_KEY` is set. There are no mocks or sample data.

GitHub Actions runs type check, unused-code check, tests and build on every push.

# Run and deploy Scrim

## Run it yourself

You need Node 20+ and Postgres 14+.

```sh
git clone https://github.com/Datwebguy/scrim.git
cd scrim
npm install
createdb scrim && createdb scrim_test
cp .env.example .env.local
npm run keys          # prints two secrets; paste them into .env.local
npm run db:migrate
npm run dev           # http://localhost:3000
```

Open `/app`, choose **Testnet**, and connect a NEAR testnet wallet. To use mainnet private money you also need a partner key (below).

## Configuration

Copy `.env.example` to `.env.local`. Required:

| Setting | What it is |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `SCRIM_SECRET_KEY` | Seals private records at rest (32 random bytes, base64) |
| `SCRIM_SECRET_KEY_PREVIOUS` | Only while changing keys: the old key(s), comma-separated. See [SECURITY.md](../SECURITY.md) |
| `SCRIM_PROOF_KEY` | Signs proofs (32 random bytes, base64). Keep it safe: anyone holding it can forge proofs |

`npm run keys` generates both.

Optional:

| Setting | What it does |
| --- | --- |
| `ONECLICK_API_KEY` | Free "Distribution Channel" key from [partners.near-intents.org](https://partners.near-intents.org). Switches on moving private money on mainnet. Without it, sign-in, balances, teams and agents still work |
| `SCRIM_NETWORKS` | Networks offered at sign-in. Default `mainnet,testnet` |
| `SCRIM_AUTH_RECIPIENT` | The site's address, used in approval messages. Use your domain in production |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME` | Telegram alerts for approvers (create a bot with @BotFather) |
| `SCRIM_SITE_URL` | Public address used in alerts. Detected automatically on Vercel |
| `NEAR_RPC_URL_MAINNET`, `NEAR_RPC_URL_TESTNET`, `NEAR_INDEXER_URL_*`, `ONECLICK_URL`, `BRIDGE_RPC_URL`, `COINGECKO_URL` | Override service addresses |

`GET /api/health` reports which features are on per network and names any missing setting. It never shows values.

## Deploy

Scrim is a standard Next.js app. On Vercel:

1. Import the repository.
2. Add a Postgres database (the Neon integration sets `DATABASE_URL` for you).
3. Add `SCRIM_SECRET_KEY`, `SCRIM_PROOF_KEY` and `SCRIM_AUTH_RECIPIENT` as environment variables (mark the keys Sensitive), then `ONECLICK_API_KEY` when you have it.
4. Deploy. Database migrations run during the build.

Environment changes apply on the next deployment.

# Connecting an agent to Scrim

An **agent** is software that pays on your behalf: an AI assistant, a payroll script, a billing job. In Scrim an agent **asks** to pay and people approve, or, with a wallet of its own, pays by itself within its limits.

## The agent's key
When an owner adds an agent (Accounts → Agents → Add agent), Scrim shows a key once: `scrim_sk_…`. The software sends it as `Authorization: Bearer scrim_sk_…`.

- It can only ask to pay within the agent's limits: per payment, per time window, allowed recipients, optional expiry.
- It cannot approve, change limits or move money. It is not a wallet key.
- Scrim stores only a hash. Lost or leaked: **Connect → Make a new key**. The old key stops at once.

## Agents that pay by themselves
An owner can give an agent its own wallet (Connect → **Create wallet**), secured by OutLayer: its key lives in a secure enclave and never reaches Scrim.

1. **Add funds** opens OutLayer's funding page for the agent's wallet.
2. **Spending rules** opens OutLayer, where the owner sets the wallet's own limits with their NEAR wallet.
3. **Let it pay by itself** → requests inside the agent's Scrim limits are paid straight from its wallet, with no approval step. `get_payment` shows `submitting`, then `settled` or `failed`.

On testnet the wallet sends NEAR and Scrim reads the transfer back from the chain. On mainnet it sends USDC and pays x402 sellers the same way, choosing per agent:

- **Private** (default): funds go in through **Add funds privately** (an address on Base, Ethereum, Arbitrum, Solana or NEAR) and every payment leaves from the wallet's private balance. Recipients see a payment arrive, not which wallet sent it.
- **Public**: the wallet pays from its public NEAR Intents balance, so each payment can be looked up on the blockchain.

## Buying from paid APIs (x402)
`find_paid_apis` searches the public x402 catalog. Each result says `payable`: `"private"` (paid through NEAR Intents, approved by people or by the agent's wallet), `"wallet"` (a standard x402 seller, paid from the agent's own wallet) or `null`. Add the seller's `https://` site to the agent's allowed recipients, then `pay_x402` its address.

Standard sellers are paid on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche or Solana, with the `exact` scheme or, on EVM chains, `upto` (the seller charges what was used, never more than the price shown). The agent's wallet signs the payment in OutLayer's enclave, for exactly the price Scrim checked and at most once per purchase; the seller's payment service pays the network fee. Sellers asking for a signature valid longer than an hour are not paid. If the wallet's address on that chain is short, Scrim first tops it up from the agent's private balance (at least 1 USDC; what is left stays there for the next purchase).

## Selling to agents (x402)
Under **Sell**, an owner lists a product: a price, and what the buyer gets (a text or link, or the owner's API, called after payment). Its agent address `/api/x402/pay/<code>` answers `402 Payment Required`; an agent pays with `exact` + `near-intents` and receives the product in the paid response. Every sale lands where the owner chooses: the private balance or their wallet.

## Option 1: AI assistants (MCP)
Scrim is an MCP server at `https://<your-site>/api/mcp` (Streamable HTTP).

```json
{ "mcpServers": { "scrim": { "type": "http", "url": "https://<your-site>/api/mcp", "headers": { "Authorization": "Bearer scrim_sk_…" } } } }
```

Tools: `get_limits`, `request_payment`, `find_paid_apis`, `pay_x402`, `list_payments`, `get_payment`.

## Option 2: HTTPS
| Call | What it does |
| --- | --- |
| `GET /api/v1/agent` | Limits and what is left to spend |
| `POST /api/v1/agent/payments` | Ask to pay. Body `{recipient, amount, memo}`, header `Idempotency-Key` |
| `GET /api/v1/agent/payments` | Recent requests |
| `GET /api/v1/agent/payments/:id` | One request, and for a purchase what the seller returned |
| `GET /api/v1/agent/x402/search?q=` | Find paid APIs in the public x402 catalog, with price and whether this agent can pay |
| `POST /api/v1/agent/x402` | Buy from an x402 address. Body `{url}`, header `Idempotency-Key` |

## Updates (webhooks)
Set an `https://` address under **Connect**. Scrim POSTs when a request is `payment.requested`, `payment.policy_rejected`, `payment.approved`, `payment.submitting`, `payment.settled`, `payment.failed` or `payment.cancelled`.

Each delivery has `Scrim-Signature: t=<unix seconds>,v1=<hex>` where `v1 = HMAC-SHA256(signing secret, "<t>.<raw body>")`. The signing secret (`whsec_…`) is shown once when you save the address. Reject deliveries whose signature doesn't match or whose `t` is more than 5 minutes old.

## Alerts for people
Approvers tap **Connect Telegram** on the Accounts screen to get a message whenever a payment needs them. The site owner sets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

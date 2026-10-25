# Connecting an agent to Scrim

An **agent** is software that pays on a team's behalf: an AI assistant, a payroll script, a billing job. In Scrim an agent can **ask** to pay. People approve.

## The agent's key
When an owner adds an agent (Team → Agents → Add agent), Scrim shows a key once: `scrim_sk_…`. The software sends it as `Authorization: Bearer scrim_sk_…`.

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

## Option 1: AI assistants (MCP)
Scrim is an MCP server at `https://<your-site>/api/mcp` (Streamable HTTP).

```json
{ "mcpServers": { "scrim": { "type": "http", "url": "https://<your-site>/api/mcp", "headers": { "Authorization": "Bearer scrim_sk_…" } } } }
```

Tools: `get_limits`, `request_payment`, `pay_x402`, `list_payments`, `get_payment`.

## Option 2: HTTPS
| Call | What it does |
| --- | --- |
| `GET /api/v1/agent` | Limits and what is left to spend |
| `POST /api/v1/agent/payments` | Ask to pay. Body `{recipient, amount, memo}`, header `Idempotency-Key` |
| `GET /api/v1/agent/payments` | Recent requests |
| `GET /api/v1/agent/payments/:id` | One request |

## Updates (webhooks)
Set an `https://` address under **Connect**. Scrim POSTs when a request is `payment.requested`, `payment.policy_rejected`, `payment.approved`, `payment.submitting`, `payment.settled`, `payment.failed` or `payment.cancelled`.

Each delivery has `Scrim-Signature: t=<unix seconds>,v1=<hex>` where `v1 = HMAC-SHA256(signing secret, "<t>.<raw body>")`. The signing secret (`whsec_…`) is shown once when you save the address. Reject deliveries whose signature doesn't match or whose `t` is more than 5 minutes old.

## Alerts for people
Approvers tap **Connect Telegram** on the Team screen to get a message whenever a payment needs them. The site owner sets `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME`.

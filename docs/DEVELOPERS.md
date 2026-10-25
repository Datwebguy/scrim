# Scrim for developers

Scrim gives your software a safe way to pay. Your code or your AI assistant gets a key, the owner sets the rules, and every payment is checked against those rules before it goes anywhere. This page covers everything you need to connect: the key, the calls, the MCP server, webhooks and x402.

**On this page**

- [How it fits together](#how-it-fits-together)
- [Quick start](#quick-start)
- [Authentication](#authentication)
- [The agent API](#the-agent-api)
- [Payments and their statuses](#payments-and-their-statuses)
- [Errors and retries](#errors-and-retries)
- [Connect an AI assistant with MCP](#connect-an-ai-assistant-with-mcp)
- [Buy from paid APIs with x402](#buy-from-paid-apis-with-x402)
- [Get paid by agents with x402](#get-paid-by-agents-with-x402)
- [Webhooks](#webhooks)
- [Health check](#health-check)
- [Good habits](#good-habits)

---

## How it fits together

An **agent** is software that spends on its owner's behalf. The owner adds it in the app under **Accounts → Agents** and sets its rules: how much per payment, how much per time window, which recipients are allowed, and an optional expiry.

Your code talks to Scrim in one of two ways, and both use the same key and the same rules:

| | Best for | Entry point |
| --- | --- | --- |
| **MCP server** | AI assistants such as Claude or any MCP client | `https://<your-site>/api/mcp` |
| **HTTPS API** | Scripts, backends, billing jobs | `https://<your-site>/api/v1/agent` |

An agent works in one of two modes, chosen by the owner (`request_only` and `autonomous` in the API):

- **Asks first.** Each request that fits the rules waits for the people who approve it, then Scrim pays.
- **Pays by itself.** With a wallet of its own, a request that fits the rules is paid straight away. There is no approval step, and the rules stay in force.

In both modes a request outside the rules is stopped before anyone sees it, so your code gets a clear answer immediately. The same goes for an agent the owner has paused or whose expiry has passed.

---

## Quick start

Five minutes from a new key to a first payment request.

**1. Create an agent.** In the app, open **Accounts**, pick an account, then **Agents → Add agent**. Set *1* per payment, *5* per day, and allow one recipient. Scrim shows the key once. It starts with `scrim_sk_`. Copy it somewhere safe.

**2. See the limits.**

```sh
curl https://scrimfinance.vercel.app/api/v1/agent \
  -H "Authorization: Bearer scrim_sk_..."
```

The answer lists the agent's limits and how much it can still spend in the current window.

**3. Ask to pay.**

```sh
curl -X POST https://scrimfinance.vercel.app/api/v1/agent/payments \
  -H "Authorization: Bearer scrim_sk_..." \
  -H "Idempotency-Key: invoice-1042" \
  -H "Content-Type: application/json" \
  -d '{"recipient":"<an allowed recipient>","amount":"0.5","memo":"Invoice 1042"}'
```

A request inside the rules comes back as `awaiting_approval`, or as `submitting` when the agent pays by itself. A request outside the rules comes back as `policy_rejected`, with the reason.

**4. Follow it.**

```sh
curl https://scrimfinance.vercel.app/api/v1/agent/payments/<payment id> \
  -H "Authorization: Bearer scrim_sk_..."
```

Poll this call, or subscribe to [webhooks](#webhooks) and let Scrim tell you when the status changes.

---

## Authentication

Every agent call carries the agent's key as a bearer token:

```
Authorization: Bearer scrim_sk_...
```

The key is made to be safe to hand to software:

- It can **ask to pay** within the agent's rules. It cannot approve payments, change rules or move money on its own.
- Scrim stores only a hash of the key, so a copy exists only where you put it.
- The owner can replace it at any time under **Connect → Make a new key**. The old key stops working at once.
- Keep it in an environment variable or a secrets manager, and send it only over HTTPS.

---

## The agent API

All paths are relative to your site, for example `https://scrimfinance.vercel.app`. Requests and responses are JSON.

| Call | What it does |
| --- | --- |
| `GET /api/v1/agent` | Your limits and what is left to spend |
| `POST /api/v1/agent/payments` | Ask to pay |
| `GET /api/v1/agent/payments` | Your recent requests |
| `GET /api/v1/agent/payments/:id` | One request, and for a purchase what the seller returned |
| `GET /api/v1/agent/x402/search?q=` | Find paid APIs in the public x402 catalog |
| `POST /api/v1/agent/x402` | Buy from an x402 address |

### Check limits

`GET /api/v1/agent`

```json
{
  "agent": { "id": "...", "name": "Billing job", "mode": "request_only", "enabled": true },
  "network": "mainnet",
  "currency": { "symbol": "USDC", "decimals": 6 },
  "limits": {
    "perPayment": "25",
    "perWindow": "100",
    "windowHours": 24,
    "allowedRecipients": ["..."],
    "expiresAt": null
  },
  "budget": {
    "committedInWindow": "10000000",
    "remainingInWindow": "90000000",
    "remainingFormatted": "90",
    "decimals": 6
  }
}
```

Amounts under `budget` are in the smallest unit of the currency. Divide by `10^decimals`, or read `remainingFormatted`.

### Ask to pay

`POST /api/v1/agent/payments`

| Field | Where | Notes |
| --- | --- | --- |
| `recipient` | body | Who to pay. Must be on the agent's allowed list. |
| `amount` | body | A decimal string such as `"25"` or `"12.50"`. |
| `memo` | body | Optional note of up to 140 characters. |
| `Idempotency-Key` | header | 8 to 100 characters from `A-Z a-z 0-9 _ . : -`. |

The response holds the payment:

```json
{
  "payment": {
    "id": "...",
    "status": "awaiting_approval",
    "recipient": "...",
    "amount": "500000",
    "memo": "Invoice 1042",
    "policyDecision": { "allowed": true },
    "approvalsCount": 0,
    "expiresAt": "2026-11-02T12:00:00.000Z",
    "createdAt": "2026-10-26T12:00:00.000Z"
  }
}
```

### List and read requests

`GET /api/v1/agent/payments` returns `{ "payments": [ ... ] }`, newest first.

`GET /api/v1/agent/payments/:id` returns one payment. For an agent that pays by itself, Scrim refreshes the status from the wallet each time you read it. For an x402 purchase, the response also carries a `purchase` object with what the seller returned.

---

## Payments and their statuses

Every request moves through a small, predictable set of statuses.

| Status | Meaning |
| --- | --- |
| `policy_rejected` | The request is outside the agent's rules. It stops here and no person is asked. |
| `awaiting_approval` | It fits the rules and waits for the people who approve. |
| `approved` | Enough approvals are in. Payment is next. |
| `quoted` | Scrim has a price and is preparing the transfer. |
| `submitting` | The money is on its way. |
| `settled` | Paid and confirmed. |
| `failed` | The transfer did not complete. Any refund goes back to the owner. |
| `expired` | Nobody approved in time. |
| `cancelled` | An approver cancelled it. |

`settled`, `failed`, `expired`, `cancelled` and `policy_rejected` are final.

---

## Errors and retries

Errors share one shape:

```json
{ "error": { "code": "unauthorized", "message": "Provide an agent key as a Bearer token." } }
```

| HTTP status | Code | What to do |
| --- | --- | --- |
| 400 | `invalid_request`, `idempotency_key_required` | Fix the request. The message says which field. |
| 401 | `unauthorized` | Send a valid agent key in the `Authorization` header. |
| 404 | `not_found` | The payment or account does not exist for this agent. |
| 409 | `idempotency_conflict` | That `Idempotency-Key` was used for a different request. Use a new key. |
| 429 | `rate_limited` | Wait a minute and try again. |

**Retries are safe.** Send the same `Idempotency-Key` with the same body and Scrim returns the original payment instead of creating a second one. Use a stable key per business event, such as `invoice-1042`.

**Rate limits.** The agent API and the MCP server accept 120 requests per minute per client. The x402 payment address accepts 30 per minute.

---

## Connect an AI assistant with MCP

Scrim is a Model Context Protocol server over Streamable HTTP. Add it to any MCP client:

```json
{
  "mcpServers": {
    "scrim": {
      "type": "http",
      "url": "https://<your-site>/api/mcp",
      "headers": { "Authorization": "Bearer scrim_sk_..." }
    }
  }
}
```

The assistant then has these tools:

| Tool | What it does |
| --- | --- |
| `get_limits` | Shows the agent's limits, allowed recipients and remaining budget. Call it first. |
| `request_payment` | Asks to pay a recipient. Takes `recipient`, `amount`, optional `memo` and `idempotency_key`. |
| `find_paid_apis` | Searches the public x402 catalog. Takes `query` and an optional `limit` from 1 to 20. |
| `pay_x402` | Buys from an x402 address. Takes `url` and an optional `idempotency_key`. |
| `list_payments` | Lists recent requests and where each one stands. |
| `get_payment` | Shows one request, and what a seller returned for a purchase. |

A good first message to try: *"What can you still spend today?"* The assistant calls `get_limits` and answers from the real numbers.

Text that comes back from sellers is labelled as data. It never changes the agent's rules, and the agent's instructions stay its own.

---

## Buy from paid APIs with x402

[x402](https://x402.org) is a way to pay for a service over HTTP. A website answers `402 Payment Required` with a price, the buyer pays, and the website returns what was asked for. Scrim handles the whole exchange for your agent and keeps every purchase inside its rules.

**1. Find a seller.**

```sh
curl "https://scrimfinance.vercel.app/api/v1/agent/x402/search?q=weather&limit=5" \
  -H "Authorization: Bearer scrim_sk_..."
```

Each result has the seller's address, its price in US dollars, the chains it accepts and a `payable` field:

- `"private"` means Scrim pays it privately through NEAR Intents, with approval or from the agent's own wallet.
- `"wallet"` means a standard x402 seller that the agent's own wallet pays directly.

**2. Allow the seller.** The owner adds the seller's `https://` site to the agent's allowed recipients. This keeps the owner in charge of where money can go.

**3. Buy.**

```sh
curl -X POST https://scrimfinance.vercel.app/api/v1/agent/x402 \
  -H "Authorization: Bearer scrim_sk_..." \
  -H "Idempotency-Key: weather-2026-10-26" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://api.example.com/weather"}'
```

The purchase follows the same statuses as any payment. When it settles, read `GET /api/v1/agent/payments/:id` to get what the seller returned.

Standard sellers are paid on Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche and Solana, with the `exact` scheme or, on EVM chains, `upto`, where the seller charges what was used and never more than the price shown. x402 purchases run on mainnet.

---

## Get paid by agents with x402

Under **Sell** in the app, an owner lists a product with a price and chooses what the buyer receives: a text, a link, or a call to the owner's own API after payment. Each product has an agent address:

```
https://<your-site>/api/x402/pay/<code>
```

A buyer's agent talks to it like this:

1. `GET` the address. Scrim answers `402 Payment Required` with a `PAYMENT-REQUIRED` header and a body that lists the accepted coins and chains, using the `exact` scheme and the `near-intents` method.
2. The agent asks for a quote and pays the one time deposit address from the answer.
3. The agent calls the address again with the proof of payment in a `PAYMENT-SIGNATURE` header.
4. Scrim confirms the payment and returns the product in the same response, with a `PAYMENT-RESPONSE` header carrying the receipt.

Presenting the same paid deposit twice returns the product again without charging again. Each sale lands where the owner chose, either their private balance or their wallet, and appears in the product's sales list with the buyer kept anonymous.

---

## Webhooks

Set an `https://` address under **Connect** in the app and Scrim tells you the moment a request changes. Your signing secret (`whsec_...`) is shown once, when you save the address.

**Events**

`payment.requested`, `payment.policy_rejected`, `payment.approved`, `payment.submitting`, `payment.settled`, `payment.failed`, `payment.cancelled`

**Delivery**

Scrim sends a `POST` with a JSON body, the event name in a `Scrim-Event` header and a signature in `Scrim-Signature`:

```json
{
  "type": "payment.settled",
  "createdAt": "2026-10-26T12:03:41.000Z",
  "data": {
    "payment": {
      "id": "...",
      "status": "settled",
      "recipient": "...",
      "amount": "500000",
      "amountFormatted": "0.5 USDC",
      "memo": "Invoice 1042",
      "network": "mainnet"
    }
  }
}
```

**Verify the signature**

The header looks like `t=<unix seconds>,v1=<hex>`. The value `v1` is an HMAC with SHA 256 of the string `"<t>.<raw body>"`, keyed with your signing secret. Compare it in constant time and check that `t` is within the last five minutes.

Node.js:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyScrim(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (!parts.t || !parts.v1 || age > 300) return false;
  const expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
```

Python:

```python
import hmac, hashlib, time

def verify_scrim(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    if abs(time.time() - int(parts["t"])) > 300:
        return False
    signed = parts["t"].encode() + b"." + raw_body
    expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
```

Verify against the **raw** request body, before any JSON parsing. Reply with any `2xx` status to confirm receipt. Webhooks are sent to public `https://` addresses.

---

## Health check

`GET /api/health` reports whether the service is ready and which features are on for each network. It names any missing setting and never shows a value, so it is safe to use as an uptime probe.

---

## Good habits

- **Use one Idempotency-Key per business event.** It makes every retry safe.
- **Prefer webhooks to polling.** You hear about a change as it happens, and your code stays simple.
- **Start on testnet.** Choose **Testnet** at sign in to practise with free coins, then move to mainnet with small amounts.
- **Keep the key out of source control.** An environment variable is enough.
- **Let the rules do the guarding.** Keep the agent's limits tight and its recipient list short, and widen them as you gain confidence.

Questions or ideas? Open an issue on [GitHub](https://github.com/Datwebguy/scrim/issues). For the product side of agents, read the [agents guide](AGENTS_GUIDE.md).

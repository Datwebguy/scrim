---
name: scrim-pay-and-swap
description: Prepare a private swap, a send or a withdrawal in Scrim, and hand the person the link to confirm. Use when the person asks to swap coins, pay someone, send to an exchange or move money to another chain.
license: MIT
---

# Swapping and paying with Scrim

## Pick the right tool

| The person wants to | Tool |
| --- | --- |
| Trade one coin for another inside their private balance | `prepare_swap` |
| Pay a NEAR account (`ada.near`) or a NEAR exchange address (64 characters) | `prepare_send` |
| Pay an address on another chain (Base, Solana, Ethereum and more) | `prepare_withdraw` |
| Add money from another chain | `get_deposit_address` |

## Steps

1. Get asset IDs: `get_balance` for what they hold, `find_coin` for what they want.
2. Call the `prepare_` tool. Amounts are in whole coins, like "25" or "0.5".
3. Tell the person the price from the result (`you_pay`, `they_get`, `fee_usd`), in plain words.
4. Give them the `approval_url`. The payment also waits on Scrim's Home under Waiting for your approval. They review it there and confirm with their wallet, or decline.
5. Check it with `get_request` and the `request_id`: `waiting_for_you`, `in_progress`, `done`, `failed`, `declined` or `expired`. Don't prepare the same payment again while it waits.

## Good to know

- A send to a `.near` name stays private. A send to a 64 character NEAR address is paid out on the blockchain so the exchange or wallet sees it.
- A withdrawal is public on the chain it lands on.
- `enough_balance: false` means they hold too little. Suggest a smaller amount or `get_deposit_address`.
- A request expires after a day. Prepare a new one if they come back later.
- An address that looks wrong for its chain is refused. Ask the person to check it.

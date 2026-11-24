---
name: scrim-get-started
description: Understand what a Scrim connection can do and what to do when a tool is blocked. Use when the person asks what Scrim can do, or when a tool says the private balance is locked or the connection ended.
license: MIT
---

# Scrim: what this connection can do

Scrim is the person's private money account on NEAR. Their balance sits in NEAR Intents confidential balances, so nobody on a block explorer sees it.

## Start here

Call `get_account` first. It tells you the account, the network and whether the private balance is unlocked.

## When a tool is blocked

- **The private balance is locked.** Ask the person to open scrim.exchange/app and tap Unlock, then try again. You can't unlock it for them.
- **The connection ended (401).** Ask them to connect Scrim again from this app.
- **Sending isn't available right now.** Scrim's payment service is down for a moment. Try again later.

## What you can and can't do

- You can read the balance and activity, find coins, price swaps and get an address to add money.
- You can prepare swaps, sends and withdrawals. Each returns an `approval_url`.
- You can't move money. Only the person can, by confirming in Scrim with their own wallet.

## Never

- Never ask for a seed phrase, private key or password. Scrim never needs one.
- Never say a payment is done because you prepared it. It is done only when `get_activity` shows it.

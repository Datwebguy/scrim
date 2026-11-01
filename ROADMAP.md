# Scrim roadmap

Scrim ships in steps. Each one makes private money easier to use for people, teams and the software that pays for them. Here is what is live, what we are building now, and what comes after.

Also online at [scrimfinance.vercel.app/roadmap](https://scrimfinance.vercel.app/roadmap). The design behind it is in the [whitepaper](docs/WHITEPAPER.md).

## Live

In people's hands today, on NEAR mainnet and testnet.

- **Private balance.** An optional private balance on NEAR Intents, opened with your own wallet. Your holdings and history stay off the public chain.
- **Add, send and swap on 30+ chains.** Bring money in from almost any chain, pay any address, and swap in public or in private. Stellar and Zcash shielded addresses included.
- **Payment links.** Share a link and get paid from any coin on any chain. The payer needs no account.
- **Sell to people and agents.** List a product, set a price, and sell it on a pay page and over x402. Sales land in your private balance or your wallet.
- **Proofs.** Show one fact, such as a minimum balance or a completed payment, to one named reader, with an expiry you choose.
- **Shared accounts.** Invite approvers, require M of N approvals, set spending limits, and download receipts for your accountant.
- **Agents with limits.** Give software a key and rules. It asks to pay, or pays by itself from its own OutLayer wallet. MCP, HTTPS and signed webhooks.
- **Ask your money.** Questions about your own money, answered by AI running in NEAR AI Cloud's secure hardware, with each answer's signature checked.
- **Wallets and alerts.** Pay from NEAR, EVM and Solana wallets. Alerts in the app and on Telegram when something needs you.

## Next

Being built now, shipping in the coming releases.

- **Hire agents on NEAR AI Agent Market.** Scrim agents hire other agents by the job over A2A and x402, paid in USDC on NEAR, inside the same limits and approvals.
- **Payroll batches.** Pay a whole team or a list of contractors in one approval, each in the coin and chain they prefer.
- **Agents that swap.** Agents trade one coin for another within their limits, with the result always landing in the agent's own balance.
- **Sell to every x402 buyer.** Accept the standard x402 payment as well as NEAR Intents, so any agent with a wallet can buy from you.
- **Ask drafts a payment.** Describe a payment in plain words and Ask prepares it for you to check and approve in your wallet.
- **One budget for all agents.** An optional total limit across every agent on an account, alongside each agent's own limits.
- **Memos for exchange deposits.** Send to exchanges that need a memo or tag, on Stellar and other chains that use them.

## Later

The longer arc: more of the trust moves to the user's device and to the chain.

- **Proofs made on your device.** Proofs generated in your own browser, so a reader can check a fact without anyone vouching for it.
- **Account rules on chain.** Approval thresholds and spending limits enforced by a NEAR contract, after a full independent audit.
- **Sign in with any wallet type.** Contract wallets and multisig accounts sign in and approve, as standard accounts do today.
- **Hardware proof for Ask.** Ask checks NEAR AI's hardware evidence end to end and shows each check, alongside today's signature check.

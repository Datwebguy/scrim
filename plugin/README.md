# Scrim plugin

[Scrim](https://scrim.exchange) is private money on NEAR. This plugin connects your AI to your Scrim account: see your private balance, find coins, and prepare private swaps, sends and withdrawals across chains.

Your AI prepares; you confirm. Every payment opens in Scrim, and nothing moves until you confirm it with your own wallet.

## Install

The Scrim address for every app is `https://scrim.exchange/api/mcp`. Add it, then sign in to Scrim when it opens.

| App | How |
| --- | --- |
| Claude | Settings, Connectors, Add custom connector, paste the address |
| ChatGPT | Settings, Apps and connectors, developer mode, create a connector with the address |
| Claude Code | `claude mcp add --transport http scrim https://scrim.exchange/api/mcp` |
| Codex | `codex mcp add scrim --url https://scrim.exchange/api/mcp` |
| Cursor, VS Code | Add `.mcp.json` from this folder |
| Grok | Add this plugin (`.grok-plugin/`) |
| Hermes Agent, bots, scripts | In Scrim, open your account, Connected apps, Make a key for an agent. Send it as `Authorization: Bearer scrim_pk_…` to the same address |

## Tools

`get_account`, `get_balance`, `get_activity`, `find_coin`, `quote_swap`, `get_request`, `get_deposit_address`, `prepare_swap`, `prepare_send`, `prepare_withdraw`.

A prepared payment waits in Scrim (its link, or Home under Waiting for your approval) until you confirm it with your wallet or decline it. It expires after a day. Full guide: [scrim.exchange/ai](https://scrim.exchange/ai).

## Skills

| Skill | Use it for |
| --- | --- |
| `scrim-get-started` | What the connection can do and what to do when a tool is blocked |
| `scrim-pay-and-swap` | Which tool to use, and handing the person the link to confirm |

## Disconnect

In Scrim, open your account, then Connected apps, then Disconnect.

## License

MIT

# NEAR_TOOLS.md

NEAR Intents is the settlement layer. Users declare an outcome; solvers fulfill it across chains. Confidential Intents runs private execution with shielded balances and settles back to public NEAR or other chains. Docs and changelog: https://docs.near-intents.org. Cumulative volume has exceeded $32 billion. Confidential TVL has reached roughly $160 million.

Chain Signatures lets a NEAR account or smart contract sign transactions on other chains via an MPC network. Supported chains include Bitcoin, Ethereum and EVM chains, Solana, TON, Sui, Aptos, XRP, and others. Docs: https://docs.near.org/chain-abstraction/chain-signatures. The MPC network is funded through protocol emissions.

NEAR AI Cloud provides private inference inside TEEs. OpenAI-compatible API at https://cloud-api.near.ai/v1. Docs: https://docs.near.ai. Useful for agent decision logic that must not leak prompts or private data.

NEAR Business is a confidential multisig treasury on Intents. It supports payroll, vendor payments, swaps, and capital allocation across 35+ chains from one dashboard. Balances and receipts stay confidential to the organization but can be exported for audit. Treasury Contracts are self-custodial. Free to start; 0.35% swap fee; gas subsidized for the first 1,000 actions per month. Site: https://business.near.com. Announcement: https://x.com/NEARProtocol/article/2112544505891070286.

Other useful primitives include function call keys, meta transactions, named accounts, sub-accounts, and TEEs. State of NEAR Q3 2026: https://x.com/NEARProtocol/article/2112225472071311506.

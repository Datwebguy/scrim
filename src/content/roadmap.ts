// What Scrim does today, what is being built now, and what is coming soon. Shown on /roadmap and in ROADMAP.md.

type RoadmapItem = { title: string; text: string };
export type RoadmapStage = { id: "live" | "building" | "soon"; label: string; summary: string; items: RoadmapItem[] };

export const ROADMAP: RoadmapStage[] = [
  {
    id: "live",
    label: "Live",
    summary: "In people's hands today, on NEAR mainnet and testnet.",
    items: [
      { title: "Private balance", text: "An optional private balance on NEAR Intents, opened with your own wallet. Your holdings and history stay off the public chain." },
      { title: "Add, send and swap on 30+ chains", text: "Bring money in from almost any chain, pay any address, and swap in public or in private. Stellar and Zcash shielded addresses included." },
      { title: "Payment links", text: "Share a link and get paid from any coin on any chain. The payer needs no account." },
      { title: "Sell to people and agents", text: "List a product, set a price, and sell it on a pay page and over x402. Sales land in your private balance or your wallet." },
      { title: "Proofs", text: "Show one fact, such as a minimum balance or a completed payment, to one named reader, with an expiry you choose." },
      { title: "Shared accounts", text: "Invite approvers, require M of N approvals, set spending limits, and download receipts for your accountant." },
      { title: "Agents with limits", text: "Give software a key and rules. It asks to pay, or pays by itself from its own OutLayer wallet. MCP, HTTPS and signed webhooks." },
      { title: "Ask your money", text: "Questions about your own money, answered by AI running in NEAR AI Cloud's secure hardware, with each answer's signature checked." },
      { title: "Wallets and alerts", text: "Pay from NEAR, EVM and Solana wallets. Alerts in the app and on Telegram when something needs you." },
    ],
  },
  {
    id: "building",
    label: "Building now",
    summary: "In development now, shipping in the coming releases.",
    items: [
      { title: "Hire agents on NEAR AI Agent Market", text: "Scrim agents hire other agents by the job over A2A and x402, paid in USDC on NEAR, inside the same limits and approvals." },
      { title: "Payroll batches", text: "Pay a whole team or a list of contractors in one approval, each in the coin and chain they prefer." },
      { title: "Agents that swap", text: "Agents trade one coin for another within their limits, with the result always landing in the agent's own balance." },
      { title: "Sell to every x402 buyer", text: "Accept the standard x402 payment as well as NEAR Intents, so any agent with a wallet can buy from you." },
      { title: "Ask drafts a payment", text: "Describe a payment in plain words and Ask prepares it for you to check and approve in your wallet." },
      { title: "One budget for all agents", text: "An optional total limit across every agent on an account, alongside each agent's own limits." },
    ],
  },
  {
    id: "soon",
    label: "Coming soon",
    summary: "Planned after that, moving more of the trust to your own device and to the chain.",
    items: [
      { title: "Proofs made on your device", text: "Proofs generated in your own browser, so a reader can check a fact without anyone vouching for it." },
      { title: "Account rules on chain", text: "Approval thresholds and spending limits enforced by a NEAR contract, after a full independent audit." },
      { title: "Sign in with any wallet type", text: "Contract wallets and multisig accounts sign in and approve, as standard accounts do today." },
      { title: "Hardware proof for Ask", text: "Ask checks NEAR AI's hardware evidence end to end and shows each check, alongside today's signature check." },
    ],
  },
];

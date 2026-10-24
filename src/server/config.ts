export type NearNetwork = "mainnet" | "testnet";

export const config = {
  // Private balances exist only on NEAR mainnet. Testnet is kept for development of team features.
  get network(): NearNetwork {
    return process.env.NEXT_PUBLIC_NEAR_NETWORK === "testnet" ? "testnet" : "mainnet";
  },
  get rpcUrl(): string {
    return process.env.NEAR_RPC_URL || (this.network === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com");
  },
  get intentsRpcUrl(): string {
    return process.env.NEAR_MAINNET_RPC_URL || "https://rpc.mainnet.fastnear.com";
  },
  get authRecipient(): string {
    return process.env.SCRIM_AUTH_RECIPIENT || "scrim.local";
  },
  get oneClickUrl(): string {
    return process.env.ONECLICK_URL || "https://1click.chaindefuser.com";
  },
  get bridgeRpcUrl(): string {
    return process.env.BRIDGE_RPC_URL || "https://bridge.chaindefuser.com/rpc";
  },
  // Partner key from partners.near-intents.org. Required for private transfers, not for reading balances.
  get oneClickApiKey(): string | undefined {
    return process.env.ONECLICK_API_KEY || undefined;
  },
  get privateTransfersEnabled(): boolean {
    return Boolean(this.oneClickApiKey) && this.network === "mainnet";
  },
  sessionTtlSeconds: 12 * 60 * 60,
  challengeTtlSeconds: 5 * 60,
  paymentTtlSeconds: 24 * 60 * 60,
  sessionCookie: "scrim_session",
};

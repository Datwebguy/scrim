export type NearNetwork = "mainnet" | "testnet";

export const config = {
  get network(): NearNetwork {
    return process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
  },
  get rpcUrl(): string {
    return process.env.NEAR_RPC_URL || (this.network === "mainnet" ? "https://rpc.mainnet.fastnear.com" : "https://rpc.testnet.fastnear.com");
  },
  get authRecipient(): string {
    return process.env.SCRIM_AUTH_RECIPIENT || "scrim.local";
  },
  get oneClickJwt(): string | undefined {
    return process.env.ONECLICK_JWT || undefined;
  },
  sessionTtlSeconds: 12 * 60 * 60,
  challengeTtlSeconds: 5 * 60,
  paymentTtlSeconds: 24 * 60 * 60,
  sessionCookie: "scrim_session",
};

import type { Metadata } from "next";
import { PublicFrame } from "@/components/PublicFrame";
import { WhitepaperPage } from "@/components/WhitepaperPage";

export const metadata: Metadata = { title: "Whitepaper", description: "How Scrim works: private balances on NEAR Intents, any chain, accounts with approvals, agents with limits, and private AI." };

export default function Page() {
  return <PublicFrame><WhitepaperPage /></PublicFrame>;
}

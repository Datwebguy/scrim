import type { Metadata } from "next";
import { AiPage } from "@/components/AiPage";
import { PublicFrame } from "@/components/PublicFrame";
import { config } from "@/server/config";

export const metadata: Metadata = {
  title: "Use Scrim with your AI",
  description: "Connect Claude, ChatGPT, Codex, Cursor, Grok or your own agent to Scrim. Ask about your money, and approve every payment in Scrim.",
};

export default function Page() {
  return <PublicFrame><AiPage mcpUrl={`${config.siteUrl}/api/mcp`} /></PublicFrame>;
}

import type { Metadata } from "next";
import { Shell } from "@/components/Shell";
import { SignIn } from "@/components/SignIn";
import { config } from "@/server/config";
import { currentSession } from "@/server/http";
import { shellTreasuries } from "@/server/workspace";

export const metadata: Metadata = { title: "Your account", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const session = await currentSession();
  if (!session) return <SignIn networks={config.enabledNetworks} />;
  const teams = await shellTreasuries(session);
  return (
    <Shell accountId={session.accountId} network={session.network} otherNetworks={config.enabledNetworks.filter((n) => n !== session.network)} teamPending={teams.reduce((n, t) => n + t.pending, 0)}>
      {children}
    </Shell>
  );
}

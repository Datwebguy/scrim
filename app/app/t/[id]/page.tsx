import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { TreasuryView } from "@/components/TreasuryView";
import { currentSession } from "@/server/http";
import { shellTreasuries } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function TreasuryPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) redirect("/app");
  const { id } = await params;
  const treasuries = await shellTreasuries(session);
  if (!treasuries.some((t) => t.id === id)) redirect("/app");
  return (
    <Shell accountId={session.accountId} network={session.network} treasuries={treasuries}>
      <TreasuryView treasuryId={id} accountId={session.accountId} />
    </Shell>
  );
}

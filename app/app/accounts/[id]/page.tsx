import { redirect } from "next/navigation";
import { TreasuryView } from "@/components/TreasuryView";
import { currentSession } from "@/server/http";
import { shellTreasuries } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function TeamAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  const { id } = await params;
  if (!(await shellTreasuries(session)).some((t) => t.id === id)) redirect("/app/accounts");
  return <TreasuryView treasuryId={id} accountId={session.accountId} />;
}

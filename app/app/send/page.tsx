import { SendNear } from "@/components/SendNear";
import { SendSwap } from "@/components/SendSwap";
import { verifiedApp } from "@/server/approval-links";
import { currentSession } from "@/server/http";

export const metadata = { title: "Send" };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  return session.network === "testnet" ? <SendNear /> : <SendSwap initial="person" aiApp={verifiedApp(session.accountId, await searchParams)} />;
}

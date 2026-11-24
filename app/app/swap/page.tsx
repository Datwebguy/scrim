import { MainnetOnly } from "@/components/Gates";
import { SendSwap } from "@/components/SendSwap";
import { currentSession } from "@/server/http";

export const metadata = { title: "Swap" };
export default async function Page() {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  return session.network === "testnet" ? <MainnetOnly feature="Swap" /> : <SendSwap initial="swap" />;
}

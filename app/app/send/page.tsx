import { SendNear } from "@/components/SendNear";
import { SendSwap } from "@/components/SendSwap";
import { currentSession } from "@/server/http";

export const metadata = { title: "Send" };
export default async function Page() {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  return session.network === "testnet" ? <SendNear /> : <SendSwap initial="person" />;
}

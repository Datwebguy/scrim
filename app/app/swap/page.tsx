import { SendSwap } from "@/components/SendSwap";
import { currentSession } from "@/server/http";

export const metadata = { title: "Swap" };
export default async function Page() {
  const session = (await currentSession())!;
  return <SendSwap initial="swap" accountId={session.accountId} />;
}

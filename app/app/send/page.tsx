import { SendSwap } from "@/components/SendSwap";
import { currentSession } from "@/server/http";

export const metadata = { title: "Send" };
export default async function Page() {
  const session = (await currentSession())!;
  return <SendSwap initial="person" accountId={session.accountId} />;
}

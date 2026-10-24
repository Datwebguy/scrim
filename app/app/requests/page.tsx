import { MainnetOnly } from "@/components/Gates";
import { Requests } from "@/components/Requests";
import { currentSession } from "@/server/http";

export const metadata = { title: "Get paid" };
export default async function Page() {
  const session = (await currentSession())!;
  return session.network === "testnet" ? <MainnetOnly feature="Getting paid by link" /> : <Requests />;
}

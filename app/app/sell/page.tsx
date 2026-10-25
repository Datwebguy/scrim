import { MainnetOnly } from "@/components/Gates";
import { Sell } from "@/components/Sell";
import { currentSession } from "@/server/http";

export const metadata = { title: "Sell" };
export default async function Page() {
  const session = (await currentSession())!;
  return session.network === "testnet" ? <MainnetOnly feature="Selling" /> : <Sell />;
}

import { MainnetOnly } from "@/components/Gates";
import { AddMoney } from "@/components/AddMoney";
import { currentSession } from "@/server/http";

export const metadata = { title: "Add money" };
export default async function Page() {
  const session = (await currentSession())!;
  return session.network === "testnet" ? <MainnetOnly feature="Adding money" /> : <AddMoney />;
}

import { MainnetOnly } from "@/components/Gates";
import { Proofs } from "@/components/Proofs";
import { currentSession } from "@/server/http";

export const metadata = { title: "Proofs" };
export default async function Page() {
  const session = (await currentSession())!;
  return session.network === "testnet" ? <MainnetOnly feature="Proofs" /> : <Proofs />;
}

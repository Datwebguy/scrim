import { Home } from "@/components/Home";
import { TestnetHome } from "@/components/TestnetHome";
import { currentSession } from "@/server/http";

export default async function HomePage() {
  const session = (await currentSession())!;
  return session.network === "testnet" ? <TestnetHome /> : <Home />;
}

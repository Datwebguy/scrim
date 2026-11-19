import { Home } from "@/components/Home";
import { TestnetHome } from "@/components/TestnetHome";
import { currentSession } from "@/server/http";

export default async function HomePage() {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  return session.network === "testnet" ? <TestnetHome /> : <Home />;
}

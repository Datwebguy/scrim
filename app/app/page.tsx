import { Home } from "@/components/Home";
import { currentSession } from "@/server/http";

export default async function HomePage() {
  const session = (await currentSession())!;
  return <Home accountId={session.accountId} />;
}

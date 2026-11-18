import { Activity } from "@/components/Activity";
import { TestnetActivity } from "@/components/TestnetActivity";
import { currentSession } from "@/server/http";

export const metadata = { title: "Activity" };
export default async function Page() {
  const session = await currentSession();
  if (!session) return null; // signed out: the layout shows sign in
  return session.network === "testnet" ? <TestnetActivity /> : <Activity />;
}

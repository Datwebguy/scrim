import { ConnectAI } from "@/components/ConnectAI";
import { OAuthError, denyRedirect, readAuthorizeRequest } from "@/server/connectors";
import { config } from "@/server/config";
import { currentSession } from "@/server/http";
import { privateStatus } from "@/server/private-access";

export const metadata = { title: "AI apps", robots: { index: false } };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

// Connect Scrim to any AI app. Opened plainly, it shows setup steps and connected apps. Opened by an app
// (with OAuth parameters), it first asks the person to approve that app.
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await currentSession();
  if (!session) return null;
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  let request: { name: string; params: Record<string, string | undefined>; denyUrl: string } | null = null;
  let problem: string | null = null;
  if (params.client_id) {
    try {
      const r = await readAuthorizeRequest(params);
      request = { name: r.client.name, params, denyUrl: denyRedirect(r) };
    } catch (error) {
      problem = error instanceof OAuthError ? error.message : "This connection request isn't valid. Start again from the app.";
    }
  }
  const priv = await privateStatus(session);
  return (
    <ConnectAI
      mcpUrl={`${config.siteUrl}/api/mcp`}
      accountId={session.accountId}
      unlocked={priv.status === "active"}
      request={request}
      problem={problem}
    />
  );
}

import { ConnectAI } from "@/components/ConnectAI";
import { looksImpersonated, returnHost } from "@/protocol/oauth";
import { OAuthError, denyRedirect, readAuthorizeRequest } from "@/server/connectors";
import { currentSession } from "@/server/http";
import { privateStatus } from "@/server/private-access";

export const metadata = { title: "Connected apps", robots: { index: false } };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;

// Opened by an AI app (with OAuth parameters): asks the person to approve it. Opened plainly: the connected apps.
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await currentSession();
  if (!session) return null;
  const raw = await searchParams;
  const params = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  let request: { name: string; params: Record<string, string | undefined>; denyUrl: string; returnsTo: string; suspicious: boolean } | null = null;
  let problem: string | null = null;
  if (params.client_id) {
    try {
      const r = await readAuthorizeRequest(params);
      request = { name: r.client.name, params, denyUrl: denyRedirect(r), returnsTo: returnHost(r.redirectUri), suspicious: looksImpersonated(r.client.name, r.redirectUri) };
    } catch (error) {
      problem = error instanceof OAuthError ? error.message : "This connection request isn't valid. Start again from the app.";
    }
  }
  const priv = await privateStatus(session);
  return (
    <ConnectAI
      accountId={session.accountId}
      unlocked={priv.status === "active"}
      request={request}
      problem={problem}
    />
  );
}

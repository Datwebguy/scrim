import { redirect } from "next/navigation";
import { CreateTreasuryForm } from "@/components/CreateTreasury";
import { Shell } from "@/components/Shell";
import { SignIn } from "@/components/SignIn";
import { config } from "@/server/config";
import { currentSession } from "@/server/http";
import { shellTreasuries } from "@/server/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspaceHome() {
  const session = await currentSession();
  if (!session) return <SignIn network={config.network} />;
  const treasuries = await shellTreasuries(session);
  if (treasuries.length > 0) redirect(`/app/t/${treasuries[0].id}`);
  return (
    <Shell accountId={session.accountId} network={session.network} treasuries={treasuries}>
      <div style={{ maxWidth: 560 }}>
        <div className="page-head">
          <div>
            <span className="eyebrow">Step 1 of 2</span>
            <h1>Create your first treasury</h1>
            <p className="muted" style={{ marginTop: 8 }}>
              A treasury holds your approval rules. Next, you can add agents with spending mandates or send a payment request.
            </p>
          </div>
        </div>
        <div className="card card-pad">
          <CreateTreasuryForm />
        </div>
      </div>
    </Shell>
  );
}

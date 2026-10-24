import Link from "next/link";
import { CreateTreasuryForm } from "@/components/CreateTreasury";
import { TelegramAlerts } from "@/components/TelegramAlerts";
import { currentSession } from "@/server/http";
import { shellTreasuries } from "@/server/workspace";

export const metadata = { title: "Team" };

export default async function TeamPage() {
  const teams = await shellTreasuries((await currentSession())!);
  return (
    <div className="narrow wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">Team</span>
          <h1>Shared accounts with rules</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 560 }}>For businesses and groups. Choose who has to approve a payment, set spending limits for people and software that pay on your behalf, and keep a record for your accountant.</p>
        </div>
      </div>
      {teams.length > 0 && <TelegramAlerts />}
      {teams.length > 0 && (
        <div className="agents-grid" style={{ marginBottom: 24 }}>
          {teams.map((t) => (
            <Link key={t.id} href={`/app/team/${t.id}`} className="card agent-card" style={{ textDecoration: "none" }}>
              <header><div><h3>{t.name}</h3><small>{t.kind === "team" ? `${t.thresholdRequired} of ${t.signerCount} approvals` : "You approve alone"}</small></div>
                {t.pending > 0 && <span className="pill pill-amber">{t.pending} waiting</span>}</header>
            </Link>
          ))}
        </div>
      )}
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <h2 style={{ marginBottom: 14 }}>{teams.length ? "Set up another team" : "Set up your team"}</h2>
        <CreateTreasuryForm />
      </div>
    </div>
  );
}

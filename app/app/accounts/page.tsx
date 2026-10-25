import Link from "next/link";
import { CreateTreasuryForm } from "@/components/CreateTreasury";
import { Invitations } from "@/components/Invitations";
import { TelegramAlerts } from "@/components/TelegramAlerts";
import { currentSession } from "@/server/http";
import { shellTreasuries } from "@/server/workspace";

export const metadata = { title: "Accounts" };

export default async function TeamPage() {
  const teams = await shellTreasuries((await currentSession())!);
  return (
    <div className="narrow wide">
      <div className="page-head">
        <div>
          <span className="eyebrow">Accounts</span>
          <h1>Accounts with rules</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 560 }}>Set spending limits and add agents that pay for you. Keep it personal, or share an account with others who approve payments together. Every payment is recorded.</p>
        </div>
      </div>
      <Invitations />
      {teams.length > 0 && <TelegramAlerts />}
      {teams.length > 0 && (
        <div className="agents-grid" style={{ marginBottom: 24 }}>
          {teams.map((t) => (
            <Link key={t.id} href={`/app/accounts/${t.id}`} className="card agent-card" style={{ textDecoration: "none" }}>
              <header><div><h3>{t.name}</h3><small>{t.kind === "team" ? `${t.thresholdRequired} of ${t.signerCount} approvals` : "You approve alone"}</small></div>
                {t.pending > 0 && <span className="pill pill-amber">{t.pending} waiting</span>}</header>
            </Link>
          ))}
        </div>
      )}
      <div className="card card-pad" style={{ maxWidth: 560 }}>
        <h2 style={{ marginBottom: 14 }}>{teams.length ? "Add another account" : "Set up your account"}</h2>
        <CreateTreasuryForm />
      </div>
    </div>
  );
}

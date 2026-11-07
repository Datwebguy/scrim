import { notFound } from "next/navigation";
import { currentSession } from "@/server/http";
import { isAdmin, usageStats } from "@/server/stats";

export const metadata = { title: "Stats", robots: { index: false } };
export const dynamic = "force-dynamic";

// Private: only the accounts listed in SCRIM_ADMIN_ACCOUNTS can open this. Everyone else gets a plain 404.
export default async function Page() {
  const session = await currentSession();
  if (!session || !isAdmin(session.accountId)) notFound();
  const s = await usageStats();
  const row = (label: string, value: number | string) => <div><dt>{label}</dt><dd>{value}</dd></div>;
  return (
    <div className="narrow wide">
      <p className="eyebrow">Stats</p>
      <h1>Who uses Scrim</h1>
      <p className="muted">Wallets that signed in, counted once each. Only you can see this page.</p>

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>Wallets</h2>
        <dl className="detail-list">
          {row("All time, every network", s.uniqueWallets)}
          {s.byNetwork.map((n) => row(`All time on ${n.network}`, n.wallets))}
          {row("All time, not counting your own accounts", s.withoutOwners)}
          {row("Today (UTC)", s.today)}
          {row("Last 7 days", s.week)}
          {row("Last 30 days", s.month)}
          {row("Sign-ins in total", s.signIns)}
        </dl>
      </section>

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>Used it for money</h2>
        <p className="muted">Wallets that made at least one transfer, add, send, swap or payout.</p>
        <dl className="detail-list">
          {s.usedMoney.length === 0 ? row("Nothing yet", 0) : s.usedMoney.map((u) => row(`On ${u.network}`, `${u.wallets} wallets, ${u.transfers} transfers`))}
        </dl>
      </section>

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>What they made</h2>
        <dl className="detail-list">
          {row("Shared accounts", s.accounts)}
          {row("Agents", s.agents)}
          {row("Payment links", s.links)}
        </dl>
      </section>

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>New wallets per day</h2>
        <dl className="detail-list">
          {s.newPerDay.length === 0 ? row("No sign-ins yet", 0) : s.newPerDay.map((d) => row(d.day, d.wallets))}
        </dl>
      </section>
    </div>
  );
}

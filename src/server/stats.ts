import { config } from "./config";
import { sql } from "./db";

// Who signed in and what they did, for the owner's private stats page. Counts wallets, never their holdings.
export type Stats = {
  byNetwork: { network: string; wallets: number }[];
  uniqueWallets: number;
  withoutOwners: number;
  today: number;
  week: number;
  month: number;
  signIns: number;
  usedMoney: { network: string; wallets: number; transfers: number }[];
  accounts: number;
  agents: number;
  links: number;
  newPerDay: { day: string; wallets: number }[];
};

export const isAdmin = (accountId: string) => config.adminAccounts.includes(accountId.toLowerCase());

export async function usageStats(): Promise<Stats> {
  const owners = config.adminAccounts;
  const [byNetwork, totals, usedMoney, counts, newPerDay] = await Promise.all([
    sql<{ network: string; wallets: number }[]>`select network, count(distinct account_id)::int as wallets from sessions group by network order by network`,
    sql<{ unique_wallets: number; without_owners: number; today: number; week: number; month: number; sign_ins: number }[]>`
      select count(distinct account_id)::int as unique_wallets,
             count(distinct account_id) filter (where account_id <> all(${owners}))::int as without_owners,
             count(distinct account_id) filter (where created_at >= date_trunc('day', now()))::int as today,
             count(distinct account_id) filter (where created_at >= now() - interval '7 days')::int as week,
             count(distinct account_id) filter (where created_at >= now() - interval '30 days')::int as month,
             count(*)::int as sign_ins
      from sessions`,
    sql<{ network: string; wallets: number; transfers: number }[]>`select network, count(distinct account_id)::int as wallets, count(*)::int as transfers from transfers group by network order by network`,
    sql<{ accounts: number; agents: number; links: number }[]>`
      select (select count(*) from treasuries)::int as accounts, (select count(*) from agents)::int as agents, (select count(*) from pay_links)::int as links`,
    sql<{ day: string; wallets: number }[]>`
      select to_char(first_seen, 'YYYY-MM-DD') as day, count(*)::int as wallets
      from (select account_id, network, date_trunc('day', min(created_at)) as first_seen from sessions group by account_id, network) f
      group by first_seen order by first_seen desc limit 14`,
  ]);
  const t = totals[0];
  const c = counts[0];
  return {
    byNetwork, uniqueWallets: t.unique_wallets, withoutOwners: t.without_owners, today: t.today, week: t.week, month: t.month, signIns: t.sign_ins,
    usedMoney, accounts: c.accounts, agents: c.agents, links: c.links, newPerDay,
  };
}

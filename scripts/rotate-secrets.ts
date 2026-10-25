// Seals every stored secret again with the current SCRIM_SECRET_KEY, so an old key can be retired.
//
//   1. Make a new key:  npm run keys
//   2. Set SCRIM_SECRET_KEY to the new key and SCRIM_SECRET_KEY_PREVIOUS to the old one, and deploy.
//   3. Run:  npm run rotate        (add --dry-run first to see what would change)
//   4. When it reports nothing left, remove SCRIM_SECRET_KEY_PREVIOUS.
import { sql } from "../src/server/db";
import { needsResealing, open, seal } from "../src/server/secrets";

type Target = { table: string; key: string[]; column: string; aad: (row: Record<string, string>) => string };

// Each sealed value is bound to its row by the same text the service uses when it writes it.
const targets: Target[] = [
  { table: "private_access", key: ["session_id", "account_id"], column: "tokens_sealed", aad: (r) => `private_access:${r.session_id}:${r.account_id}` },
  { table: "agent_wallets", key: ["agent_id"], column: "secret_sealed", aad: (r) => `agent-wallet:${r.agent_id}` },
  { table: "agents", key: ["id"], column: "webhook_secret", aad: (r) => `agent-webhook:${r.id}` },
  { table: "pay_links", key: ["id", "account_id"], column: "details_sealed", aad: (r) => `paylink:${r.id}:${r.account_id}` },
  { table: "pay_links", key: ["id", "account_id"], column: "product_sealed", aad: (r) => `product:${r.id}:${r.account_id}` },
  { table: "transfers", key: ["id", "account_id"], column: "details_sealed", aad: (r) => `transfer:${r.id}:${r.account_id}` },
  { table: "proofs", key: ["id", "account_id"], column: "details_sealed", aad: (r) => `proof:${r.id}:${r.account_id}` },
  { table: "x402_purchases", key: ["request_id"], column: "quote_sealed", aad: (r) => `x402:${r.request_id}` },
  { table: "x402_purchases", key: ["request_id"], column: "result_sealed", aad: (r) => `x402:${r.request_id}` },
  { table: "product_deliveries", key: ["purchase_key", "link_id"], column: "response_sealed", aad: (r) => `delivery:${r.link_id}:${r.purchase_key}` },
];

export async function rotateSecrets({ dryRun = false, log = console.log } = {}) {
  let changed = 0;
  let current = 0;
  for (const t of targets) {
    const columns = [...t.key, t.column].join(", ");
    const rows = await sql.unsafe<Record<string, string | null>[]>(`SELECT ${columns} FROM ${t.table} WHERE ${t.column} IS NOT NULL`);
    let stale = 0;
    for (const row of rows) {
      const sealed = row[t.column]!;
      if (!needsResealing(sealed)) {
        current++;
        continue;
      }
      stale++;
      if (dryRun) continue;
      const ids = Object.fromEntries(t.key.map((k) => [k, String(row[k])]));
      const fresh = seal(open(sealed, t.aad(ids)), t.aad(ids));
      // Only replace the value that was read, so a change made in the meantime is never overwritten.
      const where = t.key.map((k, i) => `${k}::text = $${i + 3}`).join(" AND ");
      await sql.unsafe(`UPDATE ${t.table} SET ${t.column} = $1 WHERE ${t.column} = $2 AND ${where}`, [fresh, sealed, ...t.key.map((k) => ids[k])]);
      changed++;
    }
    log(`${t.table}.${t.column}: ${stale} to re-seal${dryRun ? " (dry run)" : ""}`);
  }
  log(dryRun ? "Dry run only: nothing was changed." : `Re-sealed ${changed} value(s); ${current} were already current.`);
  return { changed, current };
}

if (process.argv[1]?.endsWith("rotate-secrets.ts")) {
  rotateSecrets({ dryRun: process.argv.includes("--dry-run") })
    .then(() => sql.end())
    .catch(async (error) => {
      console.error(error);
      await sql.end();
      process.exit(1);
    });
}

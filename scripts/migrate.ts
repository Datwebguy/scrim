import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "../src/server/db";

export async function migrate(log = console.log) {
  await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
  const dir = join(import.meta.dirname, "..", "db", "migrations");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  for (const name of files) {
    const [done] = await sql`SELECT 1 FROM schema_migrations WHERE name = ${name}`;
    if (done) continue;
    const body = await readFile(join(dir, name), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`INSERT INTO schema_migrations (name) VALUES (${name})`;
    });
    log(`applied ${name}`);
  }
}

if (process.argv[1]?.endsWith("migrate.ts")) {
  if (process.argv.includes("--if-configured") && !process.env.DATABASE_URL) {
    console.log("DATABASE_URL is not set; skipping migrations.");
    process.exit(0);
  }
  migrate()
    .then(() => sql.end())
    .catch(async (error) => {
      console.error(error);
      await sql.end();
      process.exit(1);
    });
}

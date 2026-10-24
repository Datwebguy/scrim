import postgres from "postgres";

const globalForDb = globalThis as unknown as { scrimSql?: postgres.Sql };

export const sql: postgres.Sql =
  globalForDb.scrimSql ??
  postgres(process.env.DATABASE_URL ?? "postgres://scrim:scrim@localhost:5432/scrim", {
    max: Number(process.env.DATABASE_POOL_SIZE ?? 5),
    idle_timeout: 20,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.scrimSql = sql;

export type Tx = postgres.TransactionSql | postgres.Sql;

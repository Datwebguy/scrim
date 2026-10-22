import { readFile } from 'node:fs/promises';
import { getPool } from '../packages/storage/src/postgres.mjs';
const pool=await getPool();
const db=await pool.connect();
try {
  await db.query('SELECT pg_advisory_lock(1837001)');
  const exists=(await db.query("SELECT to_regclass('public.scrim_migrations') AS name")).rows[0].name;
  const applied=exists&&(await db.query('SELECT version FROM scrim_migrations WHERE version=1')).rowCount;
  if(!applied) await db.query(await readFile(new URL('../db/migrations/001_identity_treasuries.sql',import.meta.url),'utf8'));
  console.log(applied?'Migration 1 already applied.':'Migration 1 applied.');
} finally { await db.query('SELECT pg_advisory_unlock(1837001)'); db.release(); await pool.end(); }

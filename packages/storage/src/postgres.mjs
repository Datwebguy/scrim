import { requireThat } from '../../protocol/src/index.mjs';
let pool;
export async function getPool(env = process.env) {
  requireThat(env.DATABASE_URL, 'database_not_configured', 503);
  if (!pool) { const { Pool } = await import('pg'); pool = new Pool({ connectionString: env.DATABASE_URL, max: 5, connectionTimeoutMillis: 5000, idleTimeoutMillis: 10000, statement_timeout: 8000 }); }
  return pool;
}
const challengeRow = r => r && ({ id: r.id, accountId: r.account_id, payload: r.payload, nonce: r.nonce, recipient: r.recipient, stateHash: r.state_hash, expiresAt: Date.parse(r.expires_at), purpose: r.purpose, actionHash: r.action_hash, sessionHash: r.session_hash, consumed: !!r.consumed_at });
const sessionRow = r => r && ({ accountId: r.account_id, network: r.network, csrfHash: r.csrf_hash, blockHash: r.authorization_block, expiresAt: Date.parse(r.expires_at) });
const treasuryRow = r => ({ id: r.id, actor: r.actor, network: r.network, config: r.config, configHash: r.config_hash, status: r.status, transactionHash: r.transaction_hash });
export class PostgresRepository {
  constructor(db) { this.db = db; }
  async insertChallenge(c) {
    await this.db.query('INSERT INTO auth_challenges(id,account_id,payload,nonce,recipient,state_hash,expires_at,purpose,action_hash,session_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [c.id,c.accountId,c.payload,c.nonce,c.recipient,c.stateHash,new Date(c.expiresAt),c.purpose,c.actionHash,c.sessionHash]);
  }
  async challenge(id) { return challengeRow((await this.db.query('SELECT * FROM auth_challenges WHERE id=$1',[id])).rows[0]); }
  async session(tokenHash) { return sessionRow((await this.db.query('SELECT * FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now()',[tokenHash])).rows[0]); }
  async revoke(tokenHash) { await this.db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1',[tokenHash]); }
  async finish(c, outcome) {
    const db = await this.db.connect();
    try {
      await db.query('BEGIN');
      const changed = await db.query('UPDATE auth_challenges SET consumed_at=now() WHERE id=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING id', [c.id]);
      requireThat(changed.rowCount === 1, 'challenge_expired_or_consumed', 401);
      if(c.sessionHash) {
        const active=await db.query('SELECT account_id FROM sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>now() FOR UPDATE',[c.sessionHash]);
        requireThat(active.rows[0]?.account_id===c.accountId,'session_expired',401);
      }
      let result;
      if (outcome.session) {
        const s = outcome.session;
        // Rotation revokes the prior browser session in the same transaction.
        if (outcome.previousSessionHash) await db.query('UPDATE sessions SET revoked_at=now() WHERE token_hash=$1', [outcome.previousSessionHash]);
        await db.query('INSERT INTO sessions(token_hash,account_id,network,csrf_hash,authorization_block,expires_at) VALUES($1,$2,$3,$4,$5,$6)', [s.tokenHash,s.accountId,s.network,s.csrfHash,s.blockHash,new Date(s.expiresAt)]);
      }
      if (outcome.treasury) {
        const t = outcome.treasury;
        // Unique idempotency key and body binding also hold under concurrent requests.
        await db.query('INSERT INTO treasury_intents(id,actor,network,config,config_hash,status,idempotency_key) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(actor,network,idempotency_key) DO NOTHING', [t.id,t.actor,t.network,t.config,t.configHash,t.status,t.idempotencyKey]);
        const existing = (await db.query('SELECT * FROM treasury_intents WHERE actor=$1 AND network=$2 AND idempotency_key=$3', [t.actor,t.network,t.idempotencyKey])).rows[0];
        requireThat(existing.config_hash === t.configHash, 'idempotency_conflict', 409); result = treasuryRow(existing);
      }
      await db.query('INSERT INTO authorization_events(action,account_id,subject_id,block_hash) VALUES($1,$2,$3,$4)', [c.purpose,c.accountId,result?.id ?? c.id,outcome.blockHash]);
      await db.query('COMMIT'); return result;
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
  async treasuries(actor, network) { return (await this.db.query("SELECT * FROM treasury_intents WHERE network=$2 AND (actor=$1 OR (status='active' AND config->'signerAccounts' ? $1)) ORDER BY created_at DESC LIMIT 100", [actor,network])).rows.map(treasuryRow); }
  async treasury(id, actor, network) { return (await this.treasuries(actor, network)).find(t => t.id === id); }
  async confirm(t, transactionHash, blockHash) {
    const db = await this.db.connect();
    try {
      await db.query('BEGIN');
      const row = (await db.query('UPDATE treasury_intents SET status=\'active\',transaction_hash=$2,confirmation_block=$3 WHERE id=$1 AND status=\'awaiting_chain_confirmation\' RETURNING *', [t.id,transactionHash,blockHash])).rows[0];
      requireThat(row, 'treasury_already_confirmed', 409);
      await db.query('INSERT INTO authorization_events(action,account_id,subject_id,block_hash) VALUES($1,$2,$3,$4)', ['treasury:confirmed',t.actor,t.id,blockHash]);
      await db.query('COMMIT'); return treasuryRow(row);
    } catch (error) { await db.query('ROLLBACK'); throw error; } finally { db.release(); }
  }
}

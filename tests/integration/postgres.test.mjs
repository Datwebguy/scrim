import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { getPool,PostgresRepository } from '../../packages/storage/src/postgres.mjs';

test('Postgres consumes a challenge once across competing transactions and rejects changed idempotent config',async()=>{
  // This test intentionally requires a real migrated Postgres; it has no memory fallback.
  const pool=await getPool(),repo=new PostgresRepository(pool),id=randomUUID(),key=randomUUID();
  const c={id,accountId:'fixture.testnet',payload:'payload',nonce:'nonce',recipient:'scrim.example',stateHash:'a'.repeat(64),expiresAt:Date.now()+60000,purpose:'treasury:create',actionHash:'b'.repeat(64),sessionHash:'c'.repeat(64)};
  const t={id:randomUUID(),actor:c.accountId,network:'testnet',config:{kind:'individual',contractAccountId:'existing-fixture.testnet'},configHash:c.actionHash,status:'awaiting_chain_confirmation',idempotencyKey:key};
  try{
    await pool.query('INSERT INTO sessions(token_hash,account_id,network,csrf_hash,authorization_block,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[c.sessionHash,c.accountId,'testnet','e'.repeat(64),'block',new Date(Date.now()+60000)]);
    await repo.insertChallenge(c);
    const settled=await Promise.allSettled([repo.finish(c,{blockHash:'block',treasury:t}),repo.finish(c,{blockHash:'block',treasury:t})]);
    assert.equal(settled.filter(x=>x.status==='fulfilled').length,1);
    const fresh={...c,id:randomUUID()};await repo.insertChallenge(fresh);
    await assert.rejects(repo.finish(fresh,{blockHash:'block',treasury:{...t,id:randomUUID(),configHash:'d'.repeat(64)}}),/idempotency_conflict/);
    assert.equal((await repo.challenge(fresh.id)).consumed,false,'conflict rolls back nonce consumption');
    await repo.revoke(c.sessionHash);
    const revoked={...c,id:randomUUID()};await repo.insertChallenge(revoked);
    await assert.rejects(repo.finish(revoked,{blockHash:'block',treasury:{...t,id:randomUUID(),idempotencyKey:randomUUID()}}),/session_expired/);
  }finally{
    await pool.query('DELETE FROM authorization_events WHERE account_id=$1',[c.accountId]);
    await pool.query('DELETE FROM treasury_intents WHERE idempotency_key=$1',[key]);
    await pool.query('DELETE FROM auth_challenges WHERE account_id=$1',[c.accountId]);
    await pool.query('DELETE FROM sessions WHERE token_hash=$1',[c.sessionHash]);
    await pool.end();
  }
});

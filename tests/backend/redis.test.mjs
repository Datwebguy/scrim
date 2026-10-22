import test from 'node:test';
import assert from 'node:assert/strict';
import { redisLimiter } from '../../packages/storage/src/redis.mjs';
const env={UPSTASH_REDIS_REST_URL:'https://redis.example',UPSTASH_REDIS_REST_TOKEN:'test-only'};
test('Redis limiter uses one atomic increment/expiry command and rejects excess',async()=>{
  let body;
  const limiter=redisLimiter(env,async(_url,options)=>{body=JSON.parse(options.body);return {ok:true,json:async()=>({result:21})}});
  await assert.rejects(limiter('hashed-client',20),/rate_limited/);
  assert.equal(body[0],'EVAL');assert.match(body[1],/EXPIRE/);assert.equal(body[3],'scrim:v1:hashed-client');
});
test('Redis missing credentials and provider errors fail closed',async()=>{
  assert.throws(()=>redisLimiter({}),/rate_limit_not_configured/);
  const limiter=redisLimiter(env,async()=>({ok:true,json:async()=>({error:'token details must not leak'})}));await assert.rejects(limiter('hash'),/rate_limit_unavailable/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { redisLimiter, tcpRedisLimiter } from '../../packages/storage/src/redis.mjs';
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
test('TCP Redis limiter keeps the atomic cap and fails closed',async()=>{
  assert.throws(()=>tcpRedisLimiter({}),/rate_limit_not_configured/);
  let command;
  const client={eval:async(script,args)=>{command={script,args};return 31}};
  const limiter=tcpRedisLimiter({REDIS_URL:'redis://test-only'},async()=>client);
  await assert.rejects(limiter('hashed-client',30,60),/rate_limited/);
  assert.match(command.script,/EXPIRE/);
  assert.deepEqual(command.args,{keys:['scrim:v1:hashed-client'],arguments:['60']});
});

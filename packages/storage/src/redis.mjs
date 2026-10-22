import { requireThat } from '../../protocol/src/index.mjs';
export function redisLimiter(env = process.env, fetcher = fetch) {
  requireThat(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN, 'rate_limit_not_configured', 503);
  const url = new URL(env.UPSTASH_REDIS_REST_URL); requireThat(url.protocol === 'https:', 'invalid_redis_url', 503);
  return async (key, limit = 20, seconds = 60) => {
    const script = "local v=redis.call('INCR',KEYS[1]); if v==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return v";
    const r = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`, 'content-type':'application/json' }, body: JSON.stringify(['EVAL',script,'1','scrim:v1:'+key,String(seconds)]), signal: AbortSignal.timeout(4000) });
    requireThat(r.ok, 'rate_limit_unavailable', 503); const data = await r.json();
    requireThat(!data.error && Number.isInteger(data.result), 'rate_limit_unavailable', 503);
    requireThat(data.result <= limit, 'rate_limited', 429);
  };
}

import { getPool, PostgresRepository } from '../../../packages/storage/src/postgres.mjs';
import { redisLimiter } from '../../../packages/storage/src/redis.mjs';
import { NearRpc } from '../../../packages/auth/src/rpc.mjs';
import { AuthorizationResolver } from '../../../packages/auth/src/resolver.mjs';
import { IdentityService } from '../../../packages/auth/src/service.mjs';
import { TreasuryService } from './treasuries.mjs';
import { requireThat } from '../../../packages/protocol/src/index.mjs';
export async function runtime(env=process.env) {
  requireThat(env.SCRIM_ORIGIN && env.SCRIM_NETWORK && env.NEAR_RPC_URL,'service_not_configured',503);
  const repo=new PostgresRepository(await getPool(env));
  const rpc=new NearRpc(env.NEAR_RPC_URL,fetch,env.SCRIM_NETWORK);
  const limiter=redisLimiter(env);
  const resolver=new AuthorizationResolver({rpc,network:env.SCRIM_NETWORK});
  const identity=new IdentityService({repo,resolver,origin:env.SCRIM_ORIGIN,network:env.SCRIM_NETWORK});
  const treasury=new TreasuryService({repo,rpc,network:env.SCRIM_NETWORK,approvedCodeHashes:(env.TREASURY_CODE_HASH_ALLOWLIST??'').split(',').filter(Boolean)});
  return {repo,identity,treasury,limiter,origin:env.SCRIM_ORIGIN};
}

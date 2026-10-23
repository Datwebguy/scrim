import { randomBytes, randomUUID } from 'node:crypto';
import { hash, commitment, requireThat, accountId, treasuryConfig } from '../../protocol/src/index.mjs';
const token = () => randomBytes(32).toString('base64url');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export class IdentityService {
  constructor({ repo, resolver, network, origin, clock = Date.now }) {
    requireThat(['testnet','mainnet'].includes(network), 'invalid_network', 503);
    const url = new URL(origin); requireThat(url.protocol === 'https:' && url.origin === origin, 'invalid_origin', 503);
    this.repo = repo; this.resolver = resolver; this.network = network; this.origin = origin; this.clock = clock;
  }
  async issue({ account, purpose = 'session', action, sessionToken, csrf }) {
    accountId(account); requireThat(['session','treasury:create'].includes(purpose), 'unsupported_purpose');
    let sessionHash = null, actionHash = null;
    if (purpose !== 'session') {
      const session = await this.authenticate(sessionToken, csrf);
      requireThat(session.accountId === account, 'account_mismatch', 403);
      sessionHash = hash(sessionToken); actionHash = commitment(treasuryConfig(action, account));
    }
    const id = randomUUID(), state = token(), nonce = randomBytes(32), expiresAt = this.clock()+300000;
    const payload = JSON.stringify({ domain: this.origin, action: purpose, msg: JSON.stringify({ id, nonce: nonce.toString('base64'), network: this.network, accountId: account, origin: this.origin, expiresAt, actionHash }) });
    const c = { id, accountId:account, payload, nonce:nonce.toString('base64'), recipient:new URL(this.origin).host, stateHash:hash(state), expiresAt, purpose, actionHash, sessionHash };
    await this.repo.insertChallenge(c);
    return { id, state, payload, expiresAt, nep413: { message:payload, nonce:c.nonce, recipient:c.recipient } };
  }
  async authenticate(sessionToken, csrf) {
    requireThat(typeof sessionToken === 'string' && sessionToken.length === 43, 'session_required', 401);
    const session = await this.repo.session(hash(sessionToken));
    requireThat(session && session.expiresAt>this.clock() && session.network===this.network, 'session_expired', 401);
    if (csrf !== undefined) requireThat(typeof csrf === 'string' && hash(csrf)===session.csrfHash, 'csrf_mismatch', 403);
    return session;
  }
  async authorize({ id, state, authorization, signed, sessionToken, csrf, action, idempotencyKey }) {
    requireThat(UUID.test(id) && typeof state === 'string', 'invalid_challenge');
    const c = await this.repo.challenge(id);
    requireThat(c && !c.consumed && c.expiresAt>this.clock() && hash(state)===c.stateHash, 'challenge_expired_or_consumed', 401);
    requireThat(Boolean(authorization) !== Boolean(signed), 'one_authorization_required');
    let config;
    if (c.purpose !== 'session') {
      const s = await this.authenticate(sessionToken, csrf);
      requireThat(s.accountId===c.accountId && hash(sessionToken)===c.sessionHash, 'session_binding_mismatch', 403);
      config=treasuryConfig(action,c.accountId);
      requireThat(commitment(config)===c.actionHash, 'action_binding_mismatch', 401);
      requireThat(UUID.test(idempotencyKey), 'invalid_idempotency_key');
    }
    const block = authorization ? await this.resolver.verify(c.accountId,authorization,c.payload) : await this.resolver.verifyNep413(c.accountId,signed,c);
    if (c.purpose==='session') {
      const sessionTokenNew=token(), csrfNew=token(), expiresAt=this.clock()+900000;
      await this.repo.finish(c,{ blockHash:block.hash, previousSessionHash:sessionToken ? hash(sessionToken) : null, session:{ tokenHash:hash(sessionTokenNew), csrfHash:hash(csrfNew), accountId:c.accountId, network:this.network, blockHash:block.hash, expiresAt } });
      return { sessionToken:sessionTokenNew, csrf:csrfNew, accountId:c.accountId, expiresAt };
    }
    // Only a signed configuration intent; no account creation or transaction signing here.
    return this.repo.finish(c,{ blockHash:block.hash, treasury:{ id:randomUUID(), actor:c.accountId, network:this.network, config, configHash:c.actionHash, idempotencyKey, status:'awaiting_chain_confirmation' } });
  }
}

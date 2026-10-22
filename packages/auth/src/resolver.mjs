import { requireThat, accountId } from '../../protocol/src/index.mjs';
import { fromBase58, timestampNs, nep413Hash, nep641SigningParams, verifyEd25519 } from './encoding.mjs';
const exact = (obj, fields) => obj && Object.keys(obj).every(k => fields.includes(k));
export class AuthorizationResolver {
  constructor({ rpc, network, maxDepth = 4, maxNodes = 32 }) { this.rpc = rpc; this.network = network; this.maxDepth = maxDepth; this.maxNodes = maxNodes; }
  async access(account, path, authorization, block) {
    const a = JSON.parse(authorization);
    requireThat(exact(a, ['msg','via','access_key','signature']) && a.msg && a.via, 'invalid_access_authorization');
    const m = a.msg;
    requireThat(exact(m, ['chain_id','signer_id','path','timestamp','payload']), 'invalid_envelope');
    requireThat(m.chain_id === this.network && m.signer_id === account && JSON.stringify(m.path ?? []) === JSON.stringify(path), 'authorization_binding_mismatch', 401);
    requireThat(timestampNs(m.timestamp) <= block.timestampNs, 'future_authorization', 401);
    requireThat(exact(a.via, ['schema','extra']) && a.via.schema === 'nep413' && exact(a.via.extra ?? {}, ['callback_url']), 'unsupported_schema');
    requireThat(typeof a.signature === 'string' && a.signature.startsWith('ed25519:'), 'unsupported_signature_curve');
    verifyEd25519(a.access_key, a.signature.slice(8), nep413Hash(nep641SigningParams(m, a.via.extra?.callback_url)), 'base58');
    try {
      const key = await this.rpc.accessKey(account, a.access_key, block);
      requireThat(key.permission === 'FullAccess', 'full_access_key_required', 401);
    } catch (error) {
      // Missing keys on existing accounts must NEVER qualify as implicit ownership.
      if (error.code !== 'UNKNOWN_ACCOUNT') throw error;
      const derived = fromBase58(a.access_key.slice(8)).toString('hex');
      requireThat(account === derived, 'account_not_owned', 401);
    }
    return { payload: m.payload };
  }
  async verify(account, authorization, expectedPayload) {
    accountId(account);
    requireThat(typeof authorization === 'string' && Buffer.byteLength(authorization) <= 65536, 'invalid_authorization');
    const block = await this.rpc.finalBlock(); let nodes = 0;
    const walk = async (id, path, auth, expected) => {
      requireThat(++nodes <= this.maxNodes && path.length <= this.maxDepth, 'authorization_graph_limit', 401);
      let result;
      try { result = await this.access(id, path, auth, block); }
      catch { result = await this.rpc.resolve(id, path, auth, block); }
      requireThat(typeof result?.payload === 'string' && result.payload === expected, 'payload_mismatch', 401);
      const pending = result.pending ?? [];
      requireThat(Array.isArray(pending) && pending.length + nodes <= this.maxNodes, 'authorization_graph_limit', 401);
      for (const sub of pending) {
        requireThat(typeof sub.authorization === 'string' && Buffer.byteLength(sub.authorization) <= 65536 && typeof sub.expect === 'string', 'invalid_subauthorization', 401);
        await walk(accountId(sub.account_id), [id, ...path], sub.authorization, sub.expect);
      }
      return result.payload;
    };
    await walk(account, [], authorization, expectedPayload);
    return block;
  }
  async verifyNep413(account, signed, challenge) {
    const block = await this.rpc.finalBlock();
    requireThat(signed.accountId === account, 'account_mismatch', 401);
    verifyEd25519(signed.publicKey, signed.signature, nep413Hash({ message: challenge.payload, nonce: Buffer.from(challenge.nonce, 'base64'), recipient: challenge.recipient }));
    const key = await this.rpc.accessKey(account, signed.publicKey, block);
    requireThat(key.permission === 'FullAccess', 'full_access_key_required', 401); return block;
  }
}

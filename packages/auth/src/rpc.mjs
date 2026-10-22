import { requireThat, ScrimError, accountId } from '../../protocol/src/index.mjs';
export class NearRpc {
  constructor(url, fetcher = fetch, network) {
    requireThat(typeof url === 'string' && new URL(url).protocol === 'https:', 'rpc_not_configured', 503);
    this.url = url; this.fetcher = fetcher; this.network = network;
  }
  async call(method, params) {
    const response = await this.fetcher(this.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'scrim', method, params }), signal: AbortSignal.timeout(8000) });
    requireThat(response.ok, 'rpc_unavailable', 503);
    const data = await response.json();
    if (data.error) {
      const cause = data.error?.cause?.name ?? data.error?.data?.cause?.name;
      throw new ScrimError(['UNKNOWN_ACCOUNT','UNKNOWN_ACCESS_KEY','NO_CONTRACT_CODE','CONTRACT_EXECUTION_ERROR'].includes(cause) ? cause : 'rpc_query_failed', 503);
    }
    requireThat(data.result !== undefined, 'rpc_invalid_response', 503); return data.result;
  }
  async finalBlock() {
    requireThat(['testnet','mainnet'].includes(this.network), 'rpc_network_not_configured', 503);
    const status = await this.call('status', []);
    requireThat(status.chain_id === this.network, 'rpc_network_mismatch', 503);
    const data = await this.call('block', { finality: 'final' });
    const b = { hash: data.header.hash, timestampNs: BigInt(data.header.timestamp_nanosec) };
    const age = BigInt(Date.now()) * 1000000n - b.timestampNs;
    requireThat(age >= -30000000000n && age <= 120000000000n, 'rpc_stale_block', 503);
    return b;
  }
  async query(params, block) {
    const result = await this.call('query', { ...params, block_id: block.hash });
    requireThat(result.block_hash === block.hash, 'rpc_block_mismatch', 503); return result;
  }
  accessKey(account, publicKey, block) { return this.query({ request_type: 'view_access_key', account_id: accountId(account), public_key: publicKey }, block); }
  async resolve(account, path, authorization, block) {
    const result = await this.query({ request_type: 'call_function', account_id: accountId(account), method_name: 'w_resolve_auth', args_base64: Buffer.from(JSON.stringify({ path, authorization })).toString('base64') }, block);
    requireThat(Array.isArray(result.result) && result.result.length <= 65536, 'resolver_response_too_large');
    return JSON.parse(Buffer.from(result.result).toString());
  }
  async treasury(account, block) {
    const result = await this.query({ request_type: 'call_function', account_id: accountId(account), method_name: 'get_config', args_base64: 'e30=' }, block);
    return JSON.parse(Buffer.from(result.result).toString());
  }
}

import { release } from '../apps/release/core.mjs';

const validId = value => typeof value === 'string' && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(value);
const rpc = async (method, params) => {
  const response = await fetch('https://rpc.testnet.near.org', { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'scrim-testnet-read', method, params }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('rpc_unavailable');
  const data = await response.json();
  if (data.error || !data.result) throw Error('rpc_unavailable');
  return data.result;
};

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (request.method !== 'GET') return response.status(405).json({ error: 'method_not_allowed' });
  const accountId = new URL(request.url, 'https://scrim.local').searchParams.get('accountId');
  if (!validId(accountId)) return response.status(400).json({ error: 'invalid_testnet_account' });
  try {
    const block = await rpc('block', { finality: 'final' });
    const query = params => rpc('query', { ...params, block_id: block.header.hash });
    const state = await query({ request_type: 'view_account', account_id: accountId });
    if (state.code_hash !== release.nearCodeHash) return response.status(409).json({ error: 'unapproved_contract_code' });
    const [raw, rawVersion, access] = await Promise.all([
      query({ request_type: 'call_function', account_id: accountId, method_name: 'get_config', args_base64: 'e30=' }),
      query({ request_type: 'call_function', account_id: accountId, method_name: 'get_policy_version', args_base64: 'e30=' }),
      query({ request_type: 'view_access_key_list', account_id: accountId }),
    ]);
    const decode = value => JSON.parse(Buffer.from(value.result).toString('utf8'));
    return response.status(200).json({ network: 'testnet', accountId, finalBlock: block.header.hash, codeHash: state.code_hash,
      config: decode(raw), policyVersion: decode(rawVersion), accessKeyCount: access.keys.length });
  } catch { return response.status(503).json({ error: 'testnet_read_unavailable' }); }
}

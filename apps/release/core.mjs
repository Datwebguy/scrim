// Administrative testnet tooling. This module has no wallet or submission calls.
export const release = Object.freeze({
  sourceCommit: '2fdd59a5dcf0252e007cb264a3986310cfe0bb58',
  runId: '39837763837',
  byteLength: 345452,
  sha256: '188697aeb9656663606657926c9f469431128ea83f7cb43cb3e168a0b0c3dc95',
  nearCodeHash: '2ejpWGN8wiwKQwN38QvYArV62NdDptQNyyuHC8QqgaFE',
  artifactUrl: 'https://github.com/Datwebguy/scrim/actions/runs/39837763837/artifacts/12451472003',
});
function check(condition, message) { if (!condition) throw new Error(message); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
async function digest(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
function hex(bytes) { return Array.from(bytes, x => x.toString(16).padStart(2, '0')).join(''); }
export async function commitment(value) { return hex(await digest(new TextEncoder().encode('SCRIM_V1\0' + canonical(value)))); }
export async function verifyArtifact(bytes) {
  check(bytes instanceof Uint8Array && bytes.length === release.byteLength, 'The contract file has the wrong size. Use the linked CI artifact.');
  check([0,97,115,109,1,0,0,0].every((x,i) => bytes[i] === x), 'This is not a WASM contract.');
  check(hex(await digest(bytes)) === release.sha256, 'Contract hash mismatch. This file is not the reviewed build.');
  return true;
}
export function validateAccounts(contract, owner) {
  const valid = x => typeof x === 'string' && x.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(x);
  check(valid(contract) && valid(owner), 'Enter the two existing .testnet account IDs.');
  check(contract !== owner, 'Deployment and treasury owner must be different accounts.');
}
export async function prepareConfig(contract, owner) {
  validateAccounts(contract, owner);
  const policy = {version:1,mode:'request_only',executionEnabled:false,relayTargets:[],quoteAcceptance:'fresh_user_authorization_required'};
  const config = {kind:'individual',contractAccountId:contract,signerAccounts:[owner],threshold:1,policyCommitment:await commitment(policy)};
  const configHash = await commitment(config);
  return {config, configHash, initArgs:{kind:'individual',signer_accounts:[owner],threshold:1,policy_commitment:config.policyCommitment,config_hash:configHash}};
}
export async function rpc(method, params, transport = fetch) {
  let response;
  try {
    response = await transport('https://rpc.testnet.near.org', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0',id:'scrim-release',method,params}),
      signal:AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error('Testnet RPC could not be reached. Try Verify deployment again.');
  }
  check(response.ok, 'Testnet RPC is unavailable. No wallet request was made.');
  const body = await response.json();
  check(!body.error && body.result, 'Testnet could not confirm the requested account or contract.');
  return body.result;
}
export async function inspectAccounts(contract, owner, transport = fetch) {
  validateAccounts(contract, owner);
  const status = await rpc('status', [], transport);
  check(status.chain_id === 'testnet', 'RPC network mismatch.');
  const block = await rpc('block', {finality:'final'}, transport);
  const timestampMs = Number(BigInt(block.header.timestamp_nanosec) / 1000000n);
  check(Math.abs(Date.now() - timestampMs) <= 120000, 'Testnet final block is stale. Try again later.');
  const query = params => rpc('query', {...params,block_id:block.header.hash}, transport);
  const [deployment, administration, access] = await Promise.all([
    query({request_type:'view_account',account_id:contract}),
    query({request_type:'view_account',account_id:owner}),
    query({request_type:'view_access_key_list',account_id:contract}),
  ]);
  check(access.keys.some(x => x.access_key.permission === 'FullAccess'), 'The deployment account has no full-access key.');
  check(BigInt(deployment.amount) >= 4n * 10n ** 24n, 'Keep at least 4 test NEAR in the deployment account for code storage and gas.');
  check(BigInt(administration.amount) > 0n, 'Fund the owner account with test NEAR for governance calls.');
  return {deployment, administration, blockHash:block.header.hash};
}
export function requireUndeployed(state) {
  check(state.deployment.code_hash === '11111111111111111111111111111111', 'This account already has a contract. Use Verify deployment; this tool will not overwrite it.');
}
export function matchDeployedConfig(actual, expected) {
  const cfg = actual.config ?? actual;
  check(cfg.kind === expected.config.kind && cfg.threshold === expected.config.threshold &&
    JSON.stringify(cfg.signer_accounts) === JSON.stringify(expected.config.signerAccounts) &&
    cfg.policy_commitment === expected.config.policyCommitment && cfg.config_hash === expected.configHash,
  'The on-chain configuration does not match the reviewed owner and commitments.');
  return true;
}

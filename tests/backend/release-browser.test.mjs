import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareConfig, validateAccounts, verifyArtifact, matchDeployedConfig, inspectAccounts, requireUndeployed, release } from '../../apps/release/core.mjs';
import { treasuryConfig, commitment } from '../../packages/protocol/src/index.mjs';

const contract = 'deploy-fixture.testnet', owner = 'owner-fixture.testnet';
test('browser review commitments match the backend canonical protocol', async () => {
  const plan = await prepareConfig(contract, owner);
  const policy = {version:1,mode:'request_only',executionEnabled:false,relayTargets:[],quoteAcceptance:'fresh_user_authorization_required'};
  const config = treasuryConfig({kind:'individual',contractAccountId:contract,signerAccounts:[owner],policyCommitment:commitment(policy)}, owner);
  assert.deepEqual(plan.config, config);
  assert.equal(plan.configHash, commitment(config));
  assert.equal(plan.initArgs.config_hash, commitment(config));
});
test('browser release rejects mainnet, malformed, and reused account roles', () => {
  assert.throws(() => validateAccounts('deploy.near', owner));
  assert.throws(() => validateAccounts(contract, contract));
  assert.throws(() => validateAccounts('UPPER.testnet', owner));
});
test('unreviewed WASM fails even when its length and magic header match', async () => {
  const bytes = new Uint8Array(release.byteLength); bytes.set([0,97,115,109,1,0,0,0]);
  await assert.rejects(verifyArtifact(bytes), /hash mismatch/);
  await assert.rejects(verifyArtifact(bytes.subarray(0,8)), /wrong size/);
});
test('finalized config must bind owner, threshold, policy, and config hash', async () => {
  const expected = await prepareConfig(contract, owner);
  assert.equal(matchDeployedConfig(expected.initArgs, expected), true);
  for (const changes of [{threshold:2},{signer_accounts:[contract]},{policy_commitment:'a'.repeat(64)},{config_hash:'b'.repeat(64)}]) {
    assert.throws(() => matchDeployedConfig({...expected.initArgs,...changes}, expected));
  }
});
function transport({network='testnet',stale=false,deployed=false,fullAccess=true}={}) {
  const requests = [];
  return {requests, fetch:async (_url, options) => {
    const body = JSON.parse(options.body); requests.push(body);
    let result;
    if (body.method === 'status') result = {chain_id:network};
    else if (body.method === 'block') result = {header:{hash:'final-fixture',timestamp_nanosec:String(BigInt(Date.now() - (stale ? 300000 : 0))*1000000n)}};
    else if (body.params.request_type === 'view_access_key_list') result = {keys:[{access_key:{permission:fullAccess?'FullAccess':{FunctionCall:{}}}}]};
    else result = {amount:String(4n*10n**24n),code_hash:deployed?release.nearCodeHash:'11111111111111111111111111111111'};
    return {ok:true,json:async () => ({result})};
  }};
}
test('preflight reads one final block and never sends a transaction', async () => {
  const source=transport(); const state=await inspectAccounts(contract, owner, source.fetch);
  assert.doesNotThrow(() => requireUndeployed(state));
  assert.ok(source.requests.every(x => ['status','block','query'].includes(x.method)));
  assert.ok(source.requests.filter(x => x.method === 'query').every(x => x.params.block_id === 'final-fixture'));
  const existing=transport({deployed:true});
  assert.throws(() => requireUndeployed({deployment:{code_hash:release.nearCodeHash}}), /already has a contract/);
  assert.equal((await inspectAccounts(contract, owner, existing.fetch)).deployment.code_hash,release.nearCodeHash);
});
test('preflight rejects the wrong network, a stale final block, and missing deployment authority', async () => {
  for (const options of [{network:'mainnet'},{stale:true},{fullAccess:false}]) {
    await assert.rejects(inspectAccounts(contract, owner, transport(options).fetch));
  }
});

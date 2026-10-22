import test from 'node:test';
import assert from 'node:assert/strict';
import { codeHashes } from '../../scripts/release-manifest.mjs';
import { prepareRelease } from '../../scripts/prepare-testnet-release.mjs';
import { treasuryConfig } from '../../packages/protocol/src/index.mjs';
const wasm=Buffer.from([0,97,115,109,1,0,0,0]);
const metadata={version:1,contract:'scrim-treasury-policy',sourceCommit:'a'.repeat(40),byteLength:wasm.length,...codeHashes(wasm)};
const input={wasm,manifest:metadata,contractAccountId:'contract-fixture.testnet',ownerAccountId:'owner-fixture.testnet'};
test('release plan binds code hash and separate caller-supplied contract/owner; never signs',()=>{
  const plan=prepareRelease(input);assert.equal(plan.signing,'human_wallet_only');assert.equal(plan.config.threshold,1);assert.equal(plan.steps[0].signerId,input.contractAccountId);assert.equal(plan.steps[0].action,'AtomicActionBatch');assert.equal(plan.steps[0].actions[1].args.config_hash,plan.configHash);assert.deepEqual(plan.config.signerAccounts,[input.ownerAccountId]);assert.deepEqual(plan.policy.relayTargets,[]);
});
test('release rejects altered WASM and a mainnet target',()=>{
  assert.throws(()=>prepareRelease({...input,wasm:Buffer.concat([wasm,Buffer.from([1])])}),/artifact_hash_mismatch/);
  assert.throws(()=>prepareRelease({...input,contractAccountId:'contract-fixture.near'}),/testnet_only/);
});
test('initial and updated treasury configs must not include the contract as a signer',()=>{
  assert.throws(()=>treasuryConfig({kind:'individual',contractAccountId:input.contractAccountId,signerAccounts:[input.contractAccountId],policyCommitment:'a'.repeat(64)},input.contractAccountId),/contract_cannot_be_own_signer/);
});

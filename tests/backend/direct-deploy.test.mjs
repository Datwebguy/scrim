import test from 'node:test';
import assert from 'node:assert/strict';
import { directActions, finalAccountCheck } from '../../scripts/deploy-direct-testnet.mjs';
import { prepareRelease } from '../../scripts/prepare-testnet-release.mjs';
import { codeHashes } from '../../scripts/release-manifest.mjs';

const wasm=Buffer.from([0,97,115,109,1,0,0,0]);
const manifest={version:1,contract:'scrim-treasury-policy',sourceCommit:'a'.repeat(40),byteLength:wasm.length,...codeHashes(wasm)};
const plan=prepareRelease({wasm,manifest,contractAccountId:'deploy-fixture.testnet',ownerAccountId:'owner-fixture.testnet'});
test('direct sender keeps deploy and init in one ordered batch with reviewed arguments',()=>{
  const actions=directActions(wasm,plan);
  assert.equal(actions.length,2);
  assert.deepEqual(Buffer.from(actions[0].deployContract.code),wasm);
  assert.equal(actions[1].functionCall.methodName,'new');
  assert.equal(actions[1].functionCall.gas,30000000000000n);
  assert.equal(actions[1].functionCall.deposit,0n);
  assert.deepEqual(JSON.parse(Buffer.from(actions[1].functionCall.args).toString()),plan.steps[0].actions[1].args);
});
test('direct sender rejects a modified release plan',()=>{
  assert.throws(()=>directActions(wasm,{...plan,network:'mainnet'}));
  assert.throws(()=>directActions(wasm,{...plan,steps:[{actions:[{type:'DeployContract'}]}]}));
});
function fakeRpc({deployed=false,funded=true,key='fixture-key',permission='FullAccess'}={}){
  const calls=[];
  return {calls,finalBlock:async()=>({hash:'final-fixture'}),query:async (params,block)=>{
    calls.push({params,block});
    if(params.request_type==='view_access_key_list') return {keys:[{public_key:key,access_key:{permission}}]};
    return {code_hash:deployed?'wrong-code':'11111111111111111111111111111111',amount:String(funded?4n*10n**24n:0n)};
  }};
}
test('direct signer rechecks a matching full-access key and both funded accounts at one final block',async()=>{
  const rpc=fakeRpc();
  assert.equal(await finalAccountCheck(rpc,'deploy-fixture.testnet','owner-fixture.testnet','fixture-key'),'final-fixture');
  assert.equal(rpc.calls.length,3);
  assert.ok(rpc.calls.every(call=>call.block.hash==='final-fixture'));
  await assert.rejects(finalAccountCheck(fakeRpc({key:'other-key'}),'deploy-fixture.testnet','owner-fixture.testnet','fixture-key'));
  await assert.rejects(finalAccountCheck(fakeRpc({permission:{FunctionCall:{}}}),'deploy-fixture.testnet','owner-fixture.testnet','fixture-key'));
  await assert.rejects(finalAccountCheck(fakeRpc({deployed:true}),'deploy-fixture.testnet','owner-fixture.testnet','fixture-key'));
  await assert.rejects(finalAccountCheck(fakeRpc({funded:false}),'deploy-fixture.testnet','owner-fixture.testnet','fixture-key'));
});

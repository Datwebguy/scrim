import test from 'node:test';
import assert from 'node:assert/strict';
import { makeHandler } from '../../apps/api/src/handler.mjs';
import { IdentityService } from '../../packages/auth/src/service.mjs';
import { AuthorizationResolver } from '../../packages/auth/src/resolver.mjs';
import { TreasuryService } from '../../apps/api/src/treasuries.mjs';
import { ScrimError } from '../../packages/protocol/src/index.mjs';
import { keys,fakeRpc,TestRepository,signed } from './helpers.mjs';
function harness(overrides={}) {
  const key=keys(),repo=new TestRepository(),rpc=fakeRpc(key);
  const identity=new IdentityService({repo,resolver:new AuthorizationResolver({rpc,network:'testnet'}),network:'testnet',origin:'https://scrim.example'});
  const handler=makeHandler(async()=>({origin:'https://scrim.example',repo,identity,limiter:async()=>{},...overrides}));
  const request=async(path,{method='POST',body={},headers={}}={})=>{
    const req={url:'/api/v1/'+path,method,body,headers:{origin:'https://scrim.example','content-type':'application/json',...headers},socket:{remoteAddress:'127.0.0.1'}};
    const res={headers:{},setHeader(k,v){this.headers[k.toLowerCase()]=v;},status(code){this.statusCode=code;return this;},json(value){this.body=value;return this;}};
    await handler(req,res);return res;
  };
  return {key,repo,request};
}
test('HTTP challenge and signed login set only secure opaque cookies',async()=>{
  const h=harness(),c=await h.request('auth/challenge',{body:{accountId:'alice.testnet'}});assert.equal(c.statusCode,201);
  const v=await h.request('auth/verify',{body:{id:c.body.id,state:c.body.state,signed:signed(h.key,await h.repo.challenge(c.body.id))},headers:{cookie:c.headers['set-cookie'].split(';')[0]}});
  assert.equal(v.statusCode,200);assert.equal(v.body.sessionToken,undefined);assert.match(v.headers['set-cookie'][0],/HttpOnly; Secure; SameSite=Strict/);assert.equal(v.headers['cache-control'],'no-store');
  const session=await h.request('auth/session',{method:'GET',headers:{cookie:v.headers['set-cookie'][0].split(';')[0]}});assert.equal(session.body.accountId,'alice.testnet');
});
test('HTTP wrong origin, JSON content type and oversized input fail',async()=>{const h=harness();assert.equal((await h.request('auth/challenge',{headers:{origin:'https://attacker.example'}})).statusCode,403);assert.equal((await h.request('auth/challenge',{headers:{'content-type':'text/plain'}})).statusCode,415);assert.equal((await h.request('auth/challenge',{body:{data:'x'.repeat(96001)}})).statusCode,413);});
test('HTTP login requires challenge browser state; direct treasury request needs session',async()=>{const h=harness();assert.equal((await h.request('auth/verify',{body:{id:'12345678-1234-4123-8123-123456789abc',state:'x'}})).statusCode,403);assert.equal((await h.request('treasuries',{body:{}})).statusCode,401);});
test('HTTP dependency failure never leaks private exceptions',async()=>{const handler=makeHandler(async()=>{throw Error('postgres://secret-credential')});const res={setHeader(){},status(n){this.code=n;return this},json(v){this.data=v}};await handler({headers:{},url:'/api/v1/auth/challenge'},res);assert.equal(res.code,503);assert.equal(JSON.stringify(res.data).includes('secret'),false);});
test('HTTP rate limits fail closed',async()=>{const h=harness({limiter:async()=>{throw new ScrimError('rate_limited',429)}});assert.equal((await h.request('auth/challenge')).statusCode,429);});

const config={kind:'individual',contractAccountId:'existing-contract.testnet',signerAccounts:['alice.testnet'],threshold:1,policyCommitment:'a'.repeat(64)};
function treasuryHarness(){
  const intent={id:'id',actor:'alice.testnet',status:'awaiting_chain_confirmation',config,configHash:'b'.repeat(64)};
  const chainConfig={kind:config.kind,signer_accounts:config.signerAccounts,threshold:1,policy_commitment:config.policyCommitment,config_hash:intent.configHash};
  const rpc={finalBlock:async()=>({hash:'final'}),query:async(p)=>p.request_type==='view_account'?{code_hash:'reviewed-code'}:{keys:[]},treasury:async()=>chainConfig,call:async()=>({final_execution_status:'FINAL',status:{SuccessValue:''},receipts_outcome:[],transaction:{receiver_id:config.contractAccountId,signer_id:'alice.testnet',actions:[{FunctionCall:{method_name:'new',args:Buffer.from(JSON.stringify({config_hash:intent.configHash})).toString('base64')}}]}})};
  const repo={treasury:async()=>intent,confirm:async()=>({...intent,status:'active'})};
  return {rpc,intent,service:new TreasuryService({repo,rpc,network:'testnet',approvedCodeHashes:['reviewed-code']})};
}
test('treasury activates only after matching reviewed keyless contract and finalized init',async()=>{const h=treasuryHarness();assert.equal((await h.service.confirm('id','alice.testnet','1'.repeat(44))).status,'active');});
test('treasury rejects unknown WASM, remaining access keys, changed threshold and failed finality',async()=>{
  let h=treasuryHarness();h.rpc.query=async()=>({code_hash:'malicious'});await assert.rejects(h.service.confirm('id','alice.testnet','1'.repeat(44)),/unapproved_contract_code/);
  h=treasuryHarness();h.rpc.query=async(p)=>p.request_type==='view_account'?{code_hash:'reviewed-code'}:{keys:[{public_key:'unrevoked-key'}]};await assert.rejects(h.service.confirm('id','alice.testnet','1'.repeat(44)),/treasury_contract_has_access_keys/);
  h=treasuryHarness();h.rpc.treasury=async()=>({threshold:0});await assert.rejects(h.service.confirm('id','alice.testnet','1'.repeat(44)),/contract_config_mismatch/);
  h=treasuryHarness();h.rpc.call=async()=>({final_execution_status:'EXECUTED_OPTIMISTIC',status:{Failure:{}}});await assert.rejects(h.service.confirm('id','alice.testnet','1'.repeat(44)),/transaction_not_final_or_failed/);
});

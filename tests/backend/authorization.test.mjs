import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { AuthorizationResolver } from '../../packages/auth/src/resolver.mjs';
import { IdentityService } from '../../packages/auth/src/service.mjs';
import { timestampNs, nep413Hash, nep641Hash, fromBase58 } from '../../packages/auth/src/encoding.mjs';
import { treasuryConfig, hash, ScrimError } from '../../packages/protocol/src/index.mjs';
import { NearRpc } from '../../packages/auth/src/rpc.mjs';
import { keys,signed,envelope,fakeRpc,TestRepository } from './helpers.mjs';
function setup(){const key=keys(),repo=new TestRepository(),rpc=fakeRpc(key),resolver=new AuthorizationResolver({rpc,network:'testnet'}),identity=new IdentityService({repo,resolver,network:'testnet',origin:'https://scrim.example'});return {key,repo,rpc,resolver,identity};}
const config={kind:'individual',contractAccountId:'existing-contract.testnet',signerAccounts:['alice.testnet'],policyCommitment:'a'.repeat(64)};
async function login(s){const c=await s.identity.issue({account:'alice.testnet'}),row=await s.repo.challenge(c.id);return s.identity.authorize({id:c.id,state:c.state,signed:signed(s.key,row)});}
test('NEP-413 domain separator and Borsh option bytes are stable',()=>{
  // Independent fixture constructed directly as bytes, rather than through serialization helpers.
  const params={message:'hi',nonce:Buffer.from(Array.from({length:32},(_,i)=>i)),recipient:'myapp.com'};
  const bytes=Buffer.from('9d010080020000006869000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f090000006d796170702e636f6d00','hex');
  assert.deepEqual(nep413Hash(params),createHash('sha256').update(bytes).digest());
  assert.notDeepEqual(nep413Hash(params),nep413Hash({...params,callbackUrl:'https://scrim.example'}));
});
test('timestamp preserves nanoseconds; canonical envelope binds path/network/time',()=>{
  assert.equal(timestampNs('2026-08-05T07:28:00.123456789Z'),1785914880123456789n);
  const m={chain_id:'testnet',signer_id:'alice.testnet',path:[],timestamp:'2026-08-05T07:28:00.123456789Z',payload:'hello'};
  for(const change of [{chain_id:'mainnet'},{path:['team.testnet']},{timestamp:'2026-08-05T07:28:00.123456788Z'}])assert.notDeepEqual(nep641Hash(m),nep641Hash({...m,...change}));
});
test('real wallet signature produces a short-lived hashed session',async()=>{const s=setup(),result=await login(s);assert.equal((await s.identity.authenticate(result.sessionToken,result.csrf)).accountId,'alice.testnet');assert.equal(s.repo.sessions.has(result.sessionToken),false);assert.equal(result.sessionToken.length,43);});
test('modified signature is rejected without consuming the challenge',async()=>{const s=setup(),c=await s.identity.issue({account:'alice.testnet'}),row=await s.repo.challenge(c.id),sig=signed(s.key,row);sig.signature=Buffer.alloc(64).toString('base64');await assert.rejects(s.identity.authorize({id:c.id,state:c.state,signed:sig}),/invalid_signature/);assert.equal(row.consumed,undefined);});
test('wrong recipient cannot authenticate',async()=>{const s=setup(),c=await s.identity.issue({account:'alice.testnet'}),row=await s.repo.challenge(c.id);await assert.rejects(s.identity.authorize({id:c.id,state:c.state,signed:signed(s.key,{...row,recipient:'attacker.example'})}),/invalid_signature/);});
test('concurrent replay creates exactly one session',async()=>{const s=setup(),c=await s.identity.issue({account:'alice.testnet'}),input={id:c.id,state:c.state,signed:signed(s.key,await s.repo.challenge(c.id))};const out=await Promise.allSettled([s.identity.authorize(input),s.identity.authorize(input)]);assert.equal(out.filter(x=>x.status==='fulfilled').length,1);assert.equal(s.repo.sessions.size,1);});
test('expired challenge and wrong state are rejected',async()=>{const s=setup(),c=await s.identity.issue({account:'alice.testnet'}),row=await s.repo.challenge(c.id),sig=signed(s.key,row);await assert.rejects(s.identity.authorize({id:c.id,state:'incorrect',signed:sig}));row.expiresAt=Date.now()-1;await assert.rejects(s.identity.authorize({id:c.id,state:c.state,signed:sig}));});
test('function-call key cannot authenticate',async()=>{const s=setup();s.rpc.accessKey=async()=>({permission:{FunctionCall:{receiver_id:'scrim.testnet'}}});await assert.rejects(login(s),/full_access_key_required/);});
test('removed keys are rejected on existing implicit IDs',async()=>{const s=setup(),id=fromBase58(s.key.publicKey.slice(8)).toString('hex');s.rpc.accessKey=async()=>{throw new ScrimError('UNKNOWN_ACCESS_KEY',401)};await assert.rejects(s.resolver.verify(id,envelope(s.key,'x',{signer_id:id}),'x'));});
test('only the deriving key may authorize a nonexistent implicit account',async()=>{const s=setup(),id=fromBase58(s.key.publicKey.slice(8)).toString('hex');s.rpc.accessKey=async()=>{throw new ScrimError('UNKNOWN_ACCOUNT',401)};await s.resolver.verify(id,envelope(s.key,'x',{signer_id:id}),'x');await assert.rejects(s.resolver.verify('alice.testnet',envelope(s.key,'x'),'x'));});
test('NEP-641 keyed authorization and exact payload resolution',async()=>{const s=setup();assert.equal((await s.resolver.verify('alice.testnet',envelope(s.key,'payload'),'payload')).hash,'pinned-final-block');await assert.rejects(s.resolver.verify('alice.testnet',envelope(s.key,'other'),'payload'),/payload_mismatch/);});
for(const [name,overrides] of [['network',{chain_id:'mainnet'}],['signer',{signer_id:'bob.testnet'}],['path',{path:['team.testnet']}],['future time',{timestamp:new Date(Date.now()+60000).toISOString()}]])test(`NEP-641 rejects wrong ${name}`,async()=>{const s=setup();await assert.rejects(s.resolver.verify('alice.testnet',envelope(s.key,'payload',overrides),'payload'));});
test('contract wallet resolves all members at a single pinned block with bottom-up path',async()=>{
  const s=setup(),calls=[];s.rpc.resolve=async(id,path,_auth,block)=>{calls.push({id,path,block});assert.equal(id,'team.testnet');return {payload:'root',pending:[{account_id:'alice.testnet',authorization:envelope(s.key,'member',{path:['team.testnet']}),expect:'member'}]};};
  await s.resolver.verify('team.testnet','opaque','root');assert.equal(calls[0].block.hash,'pinned-final-block');
});
test('contract delegation substitution fails',async()=>{const s=setup();s.rpc.resolve=async(id)=>id==='team.testnet'?{payload:'root',pending:[{account_id:'alice.testnet',authorization:'opaque',expect:'approved'}]}:{payload:'substituted'};await assert.rejects(s.resolver.verify('team.testnet','opaque','root'),/payload_mismatch/);});
test('cyclic contract wallet graph is bounded',async()=>{const s=setup();s.rpc.resolve=async()=>({payload:'x',pending:[{account_id:'team.testnet',authorization:'opaque',expect:'x'}]});await assert.rejects(s.resolver.verify('team.testnet','opaque','x'),/authorization_graph_limit/);});
test('full access authorization takes precedence over contract policy',async()=>{const s=setup();s.rpc.resolve=async()=>{throw Error('must not be needed')};await s.resolver.verify('alice.testnet',envelope(s.key,'x'),'x');});
test('RPC query responses must match the pinned block',async()=>{const rpc=new NearRpc('https://rpc.testnet.near.org',async()=>({ok:true,json:async()=>({result:{block_hash:'wrong',permission:'FullAccess'}})}));await assert.rejects(rpc.accessKey('alice.testnet','ed25519:x',{hash:'expected'}),/rpc_block_mismatch/);});
test('RPC refuses a provider on the wrong network',async()=>{const rpc=new NearRpc('https://rpc.testnet.near.org',async()=>({ok:true,json:async()=>({result:{chain_id:'mainnet'}})}),'testnet');await assert.rejects(rpc.finalBlock(),/rpc_network_mismatch/);});
test('RPC rejects stale final blocks',async()=>{let n=0;const rpc=new NearRpc('https://rpc.testnet.near.org',async()=>({ok:true,json:async()=>({result:++n===1?{chain_id:'testnet'}:{header:{hash:'old',timestamp_nanosec:'1'}}})}),'testnet');await assert.rejects(rpc.finalBlock(),/rpc_stale_block/);});
test('a session cannot create a treasury without a fresh configuration signature',async()=>{
  const s=setup(),session=await login(s);const challenge=await s.identity.issue({account:'alice.testnet',purpose:'treasury:create',action:config,sessionToken:session.sessionToken,csrf:session.csrf});
  const row=await s.repo.challenge(challenge.id);const input={id:challenge.id,state:challenge.state,signed:signed(s.key,row),sessionToken:session.sessionToken,csrf:session.csrf,action:config,idempotencyKey:randomUUID()};
  await assert.rejects(s.identity.authorize({...input,action:{...config,policyCommitment:'b'.repeat(64)}}),/action_binding_mismatch/);
  const result=await s.identity.authorize(input);assert.equal(result.status,'awaiting_chain_confirmation');assert.equal(result.config.threshold,1);
});
test('treasury authorization binds the original session and CSRF token',async()=>{
  const s=setup(),session=await login(s);await assert.rejects(s.identity.issue({account:'alice.testnet',purpose:'treasury:create',action:config,sessionToken:session.sessionToken,csrf:'wrong'}),/csrf_mismatch/);
  const c=await s.identity.issue({account:'alice.testnet',purpose:'treasury:create',action:config,sessionToken:session.sessionToken,csrf:session.csrf});
  const second=await login(s);await assert.rejects(s.identity.authorize({id:c.id,state:c.state,signed:signed(s.key,await s.repo.challenge(c.id)),sessionToken:second.sessionToken,csrf:second.csrf,action:config,idempotencyKey:randomUUID()}),/session_binding_mismatch/);
});
test('individual and team defaults; duplicates and lowered team threshold fail',()=>{
  assert.equal(treasuryConfig(config,'alice.testnet').threshold,1);
  const team={...config,kind:'team',signerAccounts:['carol.testnet','alice.testnet','bob.testnet']};assert.equal(treasuryConfig(team,'alice.testnet').threshold,2);
  assert.throws(()=>treasuryConfig({...team,threshold:1},'alice.testnet'));
  assert.throws(()=>treasuryConfig({...team,signerAccounts:['alice.testnet','alice.testnet','bob.testnet']},'alice.testnet'));
  assert.throws(()=>treasuryConfig({...config,privateKey:'secret'},'alice.testnet'));
});
test('quote acceptance purpose remains disabled until its fresh-authorization implementation',async()=>{await assert.rejects(setup().identity.issue({account:'alice.testnet',purpose:'quote:accept'}),/unsupported_purpose/);});
test('sessions rotate and logout revokes authority',async()=>{const s=setup(),first=await login(s),c=await s.identity.issue({account:'alice.testnet'});await s.identity.authorize({id:c.id,state:c.state,signed:signed(s.key,await s.repo.challenge(c.id)),sessionToken:first.sessionToken});assert.equal(s.repo.sessions.has(hash(first.sessionToken)),false);});

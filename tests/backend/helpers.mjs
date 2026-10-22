import { generateKeyPairSync, sign } from 'node:crypto';
import { nep413Hash, nep641SigningParams } from '../../packages/auth/src/encoding.mjs';
import { requireThat } from '../../packages/protocol/src/index.mjs';
const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function base58(bytes) {
  let n=BigInt('0x'+Buffer.from(bytes).toString('hex')), text='';
  while(n){text=alphabet[Number(n%58n)]+text;n/=58n;}
  for(const b of bytes){if(b!==0)break;text='1'+text;}return text;
}
export function keys() {
  const {publicKey,privateKey}=generateKeyPairSync('ed25519');
  return {privateKey,publicKey:'ed25519:'+base58(publicKey.export({format:'der',type:'spki'}).subarray(-32))};
}
export function signed(key,c,account='alice.testnet') {
  return {accountId:account,publicKey:key.publicKey,signature:sign(null,nep413Hash({message:c.payload,nonce:Buffer.from(c.nonce,'base64'),recipient:c.recipient}),key.privateKey).toString('base64')};
}
export function envelope(key,payload,overrides={}) {
  const msg={chain_id:'testnet',signer_id:'alice.testnet',path:[],timestamp:new Date(Date.now()-60000).toISOString(),payload,...overrides};
  return JSON.stringify({msg,via:{schema:'nep413',extra:{}},access_key:key.publicKey,signature:'ed25519:'+base58(sign(null,nep413Hash(nep641SigningParams(msg)),key.privateKey))});
}
export class TestRepository {
  constructor(){this.challenges=new Map();this.sessions=new Map();this.items=new Map();}
  async insertChallenge(c){this.challenges.set(c.id,{...c});}
  async challenge(id){return this.challenges.get(id);}
  async session(id){return this.sessions.get(id);}
  async revoke(id){this.sessions.delete(id);}
  async finish(c,outcome){
    const row=this.challenges.get(c.id);requireThat(row&&!row.consumed&&row.expiresAt>Date.now(),'challenge_expired_or_consumed',401);
    let t;
    if(outcome.treasury){const item=outcome.treasury,old=this.items.get(item.idempotencyKey);requireThat(!old||old.configHash===item.configHash,'idempotency_conflict',409);t=old??item;}
    row.consumed=true;
    if(outcome.session){if(outcome.previousSessionHash)this.sessions.delete(outcome.previousSessionHash);this.sessions.set(outcome.session.tokenHash,outcome.session);}
    if(t)this.items.set(outcome.treasury.idempotencyKey,t);return t;
  }
}
export function fakeRpc(key){
  const block={hash:'pinned-final-block',timestampNs:BigInt(Date.now())*1000000n};
  return {finalBlock:async()=>block,accessKey:async(_account,publicKey)=>{requireThat(publicKey===key.publicKey,'UNKNOWN_ACCESS_KEY',401);return {permission:'FullAccess'};},resolve:async()=>{throw Error('No contract resolver');}};
}

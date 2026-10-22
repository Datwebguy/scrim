import { NearRpc } from '../packages/auth/src/rpc.mjs';
import { accountId,requireThat } from '../packages/protocol/src/index.mjs';
const supplied=process.argv.slice(2);
requireThat(supplied.length===2,'supply_contract_and_owner_accounts');
requireThat(supplied[0]!==supplied[1]&&supplied.every(x=>accountId(x).endsWith('.testnet')),'separate_testnet_accounts_required');
const rpc=new NearRpc('https://rpc.testnet.near.org',fetch,'testnet'),block=await rpc.finalBlock();
const result=[];
for(const id of supplied){
  const state=await rpc.query({request_type:'view_account',account_id:id},block);
  result.push({accountId:id,balanceYocto:state.amount,storageUsage:state.storage_usage,hasContract:state.code_hash!=='11111111111111111111111111111111',needsFunding:BigInt(state.amount)===0n});
}
console.log(JSON.stringify({network:'testnet',blockHash:block.hash,readOnly:true,accounts:result},null,2));

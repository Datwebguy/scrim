import { canonical, requireThat } from '../../../packages/protocol/src/index.mjs';
export class TreasuryService {
  constructor({ repo, rpc, network, approvedCodeHashes }) { this.repo=repo; this.rpc=rpc; this.network=network; this.approvedCodeHashes=approvedCodeHashes; }
  async confirm(id, actor, transactionHash) {
    const intent=await this.repo.treasury(id,actor,this.network);
    requireThat(intent && intent.actor===actor, 'treasury_not_found', 404);
    requireThat(intent.status==='awaiting_chain_confirmation','treasury_already_confirmed',409);
    requireThat(typeof transactionHash==='string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(transactionHash),'invalid_transaction_hash');
    const block=await this.rpc.finalBlock();
    const info=await this.rpc.query({request_type:'view_account',account_id:intent.config.contractAccountId},block);
    requireThat(this.approvedCodeHashes.includes(info.code_hash),'unapproved_contract_code',409);
    const keys=await this.rpc.query({request_type:'view_access_key_list',account_id:intent.config.contractAccountId},block);
    // Full-access keys could replace the threshold contract and bypass team governance.
    requireThat(keys.keys.length===0,'treasury_contract_has_access_keys',409);
    const config=await this.rpc.treasury(intent.config.contractAccountId,block);
    const expected={kind:intent.config.kind,signer_accounts:intent.config.signerAccounts,threshold:intent.config.threshold,policy_commitment:intent.config.policyCommitment,config_hash:intent.configHash};
    requireThat(canonical(config)===canonical(expected),'contract_config_mismatch',409);
    const tx=await this.rpc.call('tx',{tx_hash:transactionHash,sender_account_id:intent.config.contractAccountId,wait_until:'FINAL'});
    const statuses=[tx.status,...(tx.receipts_outcome??[]).map(x=>x.outcome.status)];
    requireThat(tx.final_execution_status==='FINAL' && statuses.every(s=>s && (Object.hasOwn(s,'SuccessValue') || Object.hasOwn(s,'SuccessReceiptId'))) && tx.transaction.receiver_id===intent.config.contractAccountId && tx.transaction.signer_id===intent.config.contractAccountId,'transaction_not_final_or_failed',409);
    // Confirm an actual init call to this contract with this exact approved config commitment.
    requireThat(tx.transaction.actions.some(a=>a.FunctionCall?.method_name==='new' && JSON.parse(Buffer.from(a.FunctionCall.args,'base64').toString()).config_hash===intent.configHash),'initialization_not_found',409);
    return this.repo.confirm(intent,transactionHash,block.hash);
  }
}

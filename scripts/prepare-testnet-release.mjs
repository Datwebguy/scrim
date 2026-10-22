import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { codeHashes } from './release-manifest.mjs';
import { treasuryConfig,commitment,requireThat } from '../packages/protocol/src/index.mjs';
export function prepareRelease({wasm,manifest,contractAccountId,ownerAccountId}) {
  requireThat(Buffer.from(wasm).subarray(0,8).equals(Buffer.from([0,97,115,109,1,0,0,0])),'invalid_wasm');
  requireThat(contractAccountId.endsWith('.testnet')&&ownerAccountId.endsWith('.testnet'),'testnet_only');
  const actual=codeHashes(wasm);
  requireThat(actual.sha256===manifest.sha256&&actual.nearCodeHash===manifest.nearCodeHash&&manifest.byteLength===wasm.length,'artifact_hash_mismatch');
  requireThat(manifest.version===1&&manifest.contract==='scrim-treasury-policy'&&/^[a-f0-9]{40}$/.test(manifest.sourceCommit),'invalid_manifest');
  const policy={version:1,mode:'request_only',executionEnabled:false,relayTargets:[],quoteAcceptance:'fresh_user_authorization_required'};
  const config=treasuryConfig({kind:'individual',contractAccountId,signerAccounts:[ownerAccountId],policyCommitment:commitment(policy)},ownerAccountId);
  const configHash=commitment(config);
  const initArgs={kind:config.kind,signer_accounts:config.signerAccounts,threshold:config.threshold,policy_commitment:config.policyCommitment,config_hash:configHash};
  return {
    network:'testnet',sourceCommit:manifest.sourceCommit,codeHash:actual.nearCodeHash,sha256:actual.sha256,
    reviewRequired:true,signing:'human_wallet_only',policyCommitmentOnly:true,policy,config,configHash,
    steps:[
      {order:1,signerId:contractAccountId,receiverId:contractAccountId,action:'DeployContract',artifact:'scrim_treasury_policy.wasm',expectedCodeHash:actual.nearCodeHash},
      {order:2,signerId:ownerAccountId,receiverId:contractAccountId,action:'FunctionCall',methodName:'new',args:initArgs,gas:'30000000000000',deposit:'0'},
      {order:3,action:'ReadAndReview',methods:['get_config','get_policy_version'],requiredOwner:ownerAccountId,requiredThreshold:1},
    ],
    afterReview:'Do not remove access keys until the owner, threshold, and a real signed config operation have been verified. Key removal requires a separate explicit human decision.',
  };
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const [wasmPath,manifestPath,contractAccountId,ownerAccountId]=process.argv.slice(2);
  if(!ownerAccountId)throw Error('Usage: node scripts/prepare-testnet-release.mjs WASM MANIFEST CONTRACT_ACCOUNT OWNER_ACCOUNT');
  const plan=prepareRelease({wasm:await readFile(wasmPath),manifest:JSON.parse(await readFile(manifestPath,'utf8')),contractAccountId,ownerAccountId});
  console.log(JSON.stringify(plan,null,2));
}

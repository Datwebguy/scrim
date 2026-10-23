import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { Account } from '@near-js/accounts';
import { JsonRpcProvider } from '@near-js/providers';
import { KeyPairSigner } from '@near-js/signers';
import { actionCreators } from '@near-js/transactions';
import { NearRpc } from '../packages/auth/src/rpc.mjs';
import { prepareRelease } from './prepare-testnet-release.mjs';

const RPC_URL = 'https://rpc.testnet.near.org';
const EXPECTED_SOURCE_COMMIT = '2fdd59a5dcf0252e007cb264a3986310cfe0bb58';
const EXPECTED_WASM_SHA256 = '188697aeb9656663606657926c9f469431128ea83f7cb43cb3e168a0b0c3dc95';
const EXPECTED_CODE_HASH = '2ejpWGN8wiwKQwN38QvYArV62NdDptQNyyuHC8QqgaFE';

export function directActions(wasm, release) {
  if (release.network !== 'testnet' || release.steps?.[0]?.actions?.length !== 2) throw Error('Unexpected release plan');
  const [deploy, init] = release.steps[0].actions;
  if (deploy.type !== 'DeployContract' || init.type !== 'FunctionCall' || init.methodName !== 'new' || init.deposit !== '0') throw Error('Unexpected release actions');
  return [actionCreators.deployContract(wasm), actionCreators.functionCall('new', init.args, BigInt(init.gas), 0n)];
}

async function readSecretWithoutEcho() {
  if (!stdin.isTTY || !stdout.isTTY || typeof stdin.setRawMode !== 'function') throw Error('A local interactive terminal is required for signing');
  stdout.write('Paste the deployment account private key locally (input hidden), then press Enter: ');
  stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
  try {
    return await new Promise((resolve, reject) => {
      let value = '';
      const onData = chunk => {
        for (const char of chunk) {
          if (char === '\u0003') { cleanup(); reject(Error('Cancelled')); return; }
          if (char === '\r' || char === '\n') { cleanup(); stdout.write('\n'); resolve(value); return; }
          if (char === '\u007f') { value = value.slice(0, -1); continue; }
          if (value.length >= 256) { cleanup(); reject(Error('Private key input is too long')); return; }
          value += char;
        }
      };
      const cleanup = () => { stdin.off('data', onData); };
      stdin.on('data', onData);
    });
  } finally { stdin.setRawMode(false); stdin.pause(); }
}

export async function finalAccountCheck(rpc, accountId, ownerId, publicKey) {
  const block = await rpc.finalBlock();
  const [deployment, owner, keys] = await Promise.all([
    rpc.query({request_type:'view_account',account_id:accountId},block),
    rpc.query({request_type:'view_account',account_id:ownerId},block),
    rpc.query({request_type:'view_access_key_list',account_id:accountId},block),
  ]);
  if (deployment.code_hash !== '11111111111111111111111111111111') throw Error('Contract already deployed; refusing overwrite');
  if (BigInt(deployment.amount) < 4n * 10n ** 24n || BigInt(owner.amount) === 0n) throw Error('Testnet account funding changed');
  if (publicKey && !keys.keys.some(entry => entry.public_key === publicKey && entry.access_key.permission === 'FullAccess')) throw Error('The provided key is not a full-access key for the deployment account');
  return block.hash;
}

export async function main(args = process.argv.slice(2)) {
  const [wasmPath, manifestPath, accountId, ownerId, mode] = args;
  if (!ownerId || (mode && mode !== '--send') || args.length > 5) throw Error('Usage: node scripts/deploy-direct-testnet.mjs WASM MANIFEST DEPLOYMENT_ACCOUNT OWNER_ACCOUNT [--send]');
  const wasm = await readFile(wasmPath);
  const manifest = JSON.parse(await readFile(manifestPath,'utf8'));
  const plan = prepareRelease({wasm,manifest,contractAccountId:accountId,ownerAccountId:ownerId});
  if (manifest.sourceCommit !== EXPECTED_SOURCE_COMMIT || manifest.sha256 !== EXPECTED_WASM_SHA256 || manifest.nearCodeHash !== EXPECTED_CODE_HASH) throw Error('This artifact is not the pinned reviewed CI build');
  const actions = directActions(wasm, plan);
  const rpc = new NearRpc(RPC_URL, fetch, 'testnet');
  const blockHash = await finalAccountCheck(rpc, accountId, ownerId);
  const review = {
    network:'testnet',sourceCommit:manifest.sourceCommit,finalBlockHash:blockHash,
    signerId:accountId,receiverId:accountId,wasmSha256:manifest.sha256,nearCodeHash:manifest.nearCodeHash,
    actions:plan.steps[0].actions,
    privateKeyInput:'local_terminal_only',
    accountKeyDeletion:false,
  };
  stdout.write(JSON.stringify(review,null,2)+'\n');
  if (mode !== '--send') { stdout.write('Read-only review complete. No signature or transaction was created.\n'); return review; }
  const secret = await readSecretWithoutEcho();
  let signer;
  try { signer = KeyPairSigner.fromSecretKey(secret); } catch { throw Error('Invalid deployment account key'); }
  const publicKey = (await signer.getPublicKey()).toString();
  const freshBlock = await finalAccountCheck(rpc, accountId, ownerId, publicKey);
  stdout.write(`Full-access key verified for ${accountId} at final block ${freshBlock}.\n`);
  const input = createInterface({input:stdin,output:stdout});
  let confirmation;
  try { confirmation = await input.question(`Type DEPLOY ${accountId} to sign and send the two-action testnet transaction: `); }
  finally { input.close(); }
  if (confirmation !== `DEPLOY ${accountId}`) throw Error('Deployment cancelled; no transaction sent');
  const account = new Account(accountId,new JsonRpcProvider({url:RPC_URL}),signer);
  let result;
  try { result = await account.signAndSendTransaction({receiverId:accountId,actions,waitUntil:'FINAL',throwOnFailure:true}); }
  catch { throw Error('Wallet submission failed or its outcome is uncertain. Check finalized on-chain code before attempting another send.'); }
  stdout.write(`Transaction result received: ${result.transaction.hash}\n`);
  stdout.write('Verify the deployed code and configuration using the Scrim testnet release page.\n');
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}

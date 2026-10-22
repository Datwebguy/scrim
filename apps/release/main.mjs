import { MeteorConnect, webpage_local_storage } from '@meteorwallet/sdk';
import { actionCreators } from '@near-js/transactions';
import { unzipSync } from 'fflate';
import { release, verifyArtifact, prepareConfig, checkWalletAccount, inspectAccounts, requireUndeployed, matchDeployedConfig, rpc } from './core.mjs';

const $ = id => document.getElementById(id);
const meteor = new MeteorConnect();
let sdkReady = false, busy = false, wasm = null, reviewed = null, account = null, action = null, submitted = false;
const status = (message, error = false) => { $('status').textContent = message; $('status').dataset.error = String(error); };
const accounts = () => [$('contract').value.trim(), $('owner').value.trim()];
function controls() {
  for (const id of ['contract','owner','artifact']) $(id).disabled = busy || submitted;
  $('review').disabled = busy || !wasm || submitted;
  $('consent').disabled = busy || !reviewed || submitted;
  $('connect').disabled = busy || !sdkReady || !reviewed || !$('consent').checked || submitted;
  $('prepare').disabled = busy || !account || !reviewed || !$('consent').checked || submitted;
  $('sign').disabled = busy || !action || !reviewed || !$('consent').checked || submitted;
  $('verify').disabled = busy;
}
async function run(fn) {
  if (busy) return;
  busy = true; controls();
  try { await fn(); } catch (error) { status(error.message || 'The operation could not be completed.', true); }
  finally { busy = false; controls(); }
}
function invalidate() {
  reviewed = null; action = null; $('consent').checked = false; $('review-output').hidden = true;
  controls();
}
$('artifact-link').href = release.artifactUrl;
$('commit').textContent = release.sourceCommit;
$('sha').textContent = release.sha256;
$('code-hash').textContent = release.nearCodeHash;
for (const id of ['contract','owner']) $(id).addEventListener('input', invalidate);
$('consent').addEventListener('change', () => { action = null; controls(); });
$('artifact').addEventListener('change', () => run(async () => {
  invalidate(); wasm = null; $('file-status').textContent = 'Checking file…';
  const file = $('artifact').files[0];
  try {
    if (!file || file.size > 2 * 1024 * 1024) throw new Error('Choose the reviewed artifact ZIP or WASM, no larger than 2 MB.');
    let bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes[0] === 80 && bytes[1] === 75) {
      const entries = unzipSync(bytes, {filter: entry => entry.name.endsWith('/scrim_treasury_policy.wasm') || entry.name === 'scrim_treasury_policy.wasm' ? entry.originalSize === release.byteLength : false});
      const matches = Object.values(entries);
      if (matches.length !== 1) throw new Error('ZIP must contain exactly one reviewed treasury WASM file.');
      bytes = matches[0];
    }
    await verifyArtifact(bytes); wasm = bytes;
    $('file-status').textContent = `Verified: ${bytes.length.toLocaleString()} bytes · SHA-256 matches the reviewed CI build.`;
    status('Contract file verified. Check the account configuration next.');
  } catch (error) { $('file-status').textContent = 'File not verified.'; throw error; }
}));
$('review').addEventListener('click', () => run(async () => {
  invalidate();
  if (!wasm) throw new Error('Choose and verify the contract file first.');
  const [contract, owner] = accounts();
  const prepared = await prepareConfig(contract, owner);
  status('Checking both accounts at a recent final testnet block…');
  const chain = await inspectAccounts(contract, owner); requireUndeployed(chain);
  reviewed = {contract, owner, ...prepared};
  $('review-output').textContent = JSON.stringify({
    network:'testnet',signerId:contract,receiverId:contract,
    sourceCommit:release.sourceCommit,codeHash:release.nearCodeHash,
    actions:[{type:'DeployContract',sha256:release.sha256},{type:'FunctionCall',methodName:'new',gas:'30000000000000',deposit:'0',args:prepared.initArgs}],
    verifiedAtFinalBlock:chain.blockHash,
  }, null, 2);
  $('review-output').hidden = false;
  status('Accounts and reviewed build checked. Read the initialization arguments, acknowledge them, then connect Meteor.');
}));
$('connect').addEventListener('click', () => run(async () => {
  if (!reviewed || !$('consent').checked) throw new Error('Review and acknowledge the configuration first.');
  const signIn = await meteor.createAction({id:'near::sign_in',input:{target:{blockchain:'near',network:'testnet'}}});
  account = null;
  const connected = await signIn.promptForExecution();
  checkWalletAccount(connected, reviewed.contract); account = connected; action = null;
  $('wallet-status').textContent = `Meteor connected: ${account.identifier.accountId} · testnet`;
  status('Correct deployment account connected. Prepare the single transaction for your final wallet review.');
}));
$('prepare').addEventListener('click', () => run(async () => {
  action = null;
  if (!reviewed || !wasm || !$('consent').checked) throw new Error('Review and acknowledge the configuration first.');
  checkWalletAccount(account, reviewed.contract); await verifyArtifact(wasm);
  const chain = await inspectAccounts(reviewed.contract, reviewed.owner); requireUndeployed(chain);
  action = await meteor.createAction({
    id:'near::sign_transactions',
    input:{target:account.identifier,useFunctionCallKey:false,transactions:[{
      receiverId:reviewed.contract,
      actions:[actionCreators.deployContract(wasm),actionCreators.functionCall('new',reviewed.initArgs,30000000000000n,0n)],
    }]},
  });
  status('The deploy-and-initialize transaction is ready. Nothing has been sent. Choose “Review & approve in Meteor” to open the wallet.');
}));
$('sign').addEventListener('click', () => run(async () => {
  if (!action || !reviewed || !$('consent').checked || submitted) throw new Error('Prepare a reviewed wallet request first.');
  checkWalletAccount(account, reviewed.contract);
  const request = action; action = null; submitted = true;
  status('Meteor is handling your review. Approve or reject in the wallet.');
  try {
    const outcomes = await request.promptForExecution();
    const hashes = (Array.isArray(outcomes) ? outcomes : [outcomes]).map(x => x?.transaction?.hash || x?.transaction_outcome?.id).filter(Boolean);
    $('transaction').textContent = hashes.length ? `Wallet returned transaction: ${hashes.join(', ')}` : 'Wallet returned. Verify the finalized contract state below.';
    status('Wallet interaction finished. Choose Verify deployment to check the final on-chain code and configuration.');
  } catch {
    status('The wallet request was rejected, interrupted, or failed. Check finalized deployment state before any retry. No automatic retry will occur.', true);
  }
}));
$('verify').addEventListener('click', () => run(async () => {
  const [contract, owner] = accounts(); const expected = await prepareConfig(contract, owner);
  const chain = await rpc('status', []);
  if (chain.chain_id !== 'testnet') throw new Error('RPC network mismatch.');
  const block = await rpc('block', {finality:'final'});
  const query = params => rpc('query', {...params,block_id:block.header.hash});
  const state = await query({request_type:'view_account',account_id:contract});
  if (state.code_hash === '11111111111111111111111111111111') {
    submitted = false; action = null;
    status('No deployed contract was found at the final block. If a wallet request is still pending, reject it in Meteor before preparing another.');
    return;
  }
  if (state.code_hash !== release.nearCodeHash) throw new Error('On-chain code does not match the reviewed release. This tool will not overwrite it.');
  const result = await query({request_type:'call_function',account_id:contract,method_name:'get_config',args_base64:'e30='});
  matchDeployedConfig(JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))), expected);
  const version = await query({request_type:'call_function',account_id:contract,method_name:'get_policy_version',args_base64:'e30='});
  const access = await query({request_type:'view_access_key_list',account_id:contract});
  submitted = true; action = null;
  status(`Verified on NEAR testnet: reviewed code, owner ${owner}, threshold 1-of-1, policy version ${new TextDecoder().decode(new Uint8Array(version.result))}. ${access.keys.length} contract access key(s) remain. Owner governance and any key lockdown still require separate review. Payments are not enabled.`);
}));
controls();
meteor.initialize({storage:webpage_local_storage,mobileBridge:{enabled:true,partnerMetadata:{name:'Scrim Testnet Release',description:'Human-reviewed treasury configuration deployment on NEAR testnet',originUrl:location.origin,iconUrl:`${location.origin}/scrim-logo.jpg`}}})
  .then(() => { sdkReady = true; $('wallet-status').textContent = 'Meteor ready · mobile, web, and desktop extension'; controls(); })
  .catch(() => { $('wallet-status').textContent = 'Meteor could not load. Refresh before connecting; no transaction was sent.'; });

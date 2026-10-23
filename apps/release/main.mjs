import { unzipSync } from 'fflate';
import { release, verifyArtifact, prepareConfig, inspectAccounts, requireUndeployed, matchDeployedConfig, rpc } from './core.mjs';

const $ = id => document.getElementById(id);
let busy = false, wasm = null, reviewed = null;
const status = (message, error = false) => { $('status').textContent = message; $('status').dataset.error = String(error); };
const accounts = () => [$('contract').value.trim(), $('owner').value.trim()];
function controls() {
  for (const id of ['contract','owner','artifact']) $(id).disabled = busy;
  $('review').disabled = busy || !wasm;
  $('verify').disabled = busy;
}
async function run(fn) {
  if (busy) return;
  busy = true; controls();
  try { await fn(); } catch (error) { status(error.message || 'The operation could not be completed.', true); }
  finally { busy = false; controls(); }
}
function invalidate() {
  reviewed = null; $('review-output').hidden = true;
  controls();
}
$('artifact-link').href = release.artifactUrl;
$('commit').textContent = release.sourceCommit;
$('sha').textContent = release.sha256;
$('code-hash').textContent = release.nearCodeHash;
for (const id of ['contract','owner']) $(id).addEventListener('input', invalidate);
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
  status('Accounts and reviewed build checked. Read the initialization arguments, then use the direct signing instructions on your own device.');
}));
$('verify').addEventListener('click', () => run(async () => {
  const [contract, owner] = accounts(); const expected = await prepareConfig(contract, owner);
  const chain = await rpc('status', []);
  if (chain.chain_id !== 'testnet') throw new Error('RPC network mismatch.');
  const block = await rpc('block', {finality:'final'});
  const query = params => rpc('query', {...params,block_id:block.header.hash});
  const state = await query({request_type:'view_account',account_id:contract});
  if (state.code_hash === '11111111111111111111111111111111') {
    status('No deployed contract was found at the final block. Meteor blocked the app request; use the direct signing instructions.');
    return;
  }
  if (state.code_hash !== release.nearCodeHash) throw new Error('On-chain code does not match the reviewed release. This tool will not overwrite it.');
  const result = await query({request_type:'call_function',account_id:contract,method_name:'get_config',args_base64:'e30='});
  matchDeployedConfig(JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))), expected);
  const version = await query({request_type:'call_function',account_id:contract,method_name:'get_policy_version',args_base64:'e30='});
  const access = await query({request_type:'view_access_key_list',account_id:contract});
  status(`Verified on NEAR testnet: reviewed code, owner ${owner}, threshold 1-of-1, policy version ${new TextDecoder().decode(new Uint8Array(version.result))}. ${access.keys.length} contract access key(s) remain. Access-key lockdown and backend activation require separate review. Payments are not enabled.`);
}));
controls();

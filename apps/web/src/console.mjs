let walletModule;
const meteorWallet = async () => walletModule ??= await import('./wallet.mjs');

const $ = selector => document.querySelector(selector);
const escaped = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (label, action, style = 'primary') => `<button class="button ${style}" type="button" data-action="${action}">${label}</button>`;
const heading = (eyebrow, title, detail, actions = '') => `<div class="page-head"><div><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${detail}</p></div><div class="actions">${actions}</div></div>`;
const panel = content => `<section class="panel panel-pad">${content}</section>`;
const navItems = [['overview','Overview'],['treasury','Treasury'],['payments','Payments'],['agents','Agent rails'],['proofs','Disclosures'],['settings','Settings']];
const state = { wallet:null, session:null, csrf:null, health:null, contract:null, contractId:'', treasuries:[], busy:false, error:'' };
let view = 'overview';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials:'same-origin', cache:'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
  return data;
}
function report(error) {
  state.error = error?.message === 'Failed to fetch' ? 'The network service could not be reached. Try again.' : String(error?.message || error);
  render();
}
async function refresh() {
  state.health = await api('/api/health');
  if (state.session) state.treasuries = (await api('/api/v1/treasuries')).treasuries;
  render();
}
async function readContract(id) {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(id)) throw Error('Enter a valid .testnet contract account.');
  state.contract = await api(`/api/testnet-contract?accountId=${encodeURIComponent(id)}`);
  state.contractId = id;
  sessionStorage.setItem('scrim-testnet-contract', id);
  render();
}
function statusCard() {
  const health = state.health;
  return panel(`<span class="panel-label">TESTNET SERVICE</span><h3>${health?.status === 'online' ? 'Backend online' : 'Backend unavailable'}</h3><p class="muted" style="margin-top:10px">${health?.status === 'online' ? `Postgres, Redis, and NEAR testnet passed a live health check at final block <span class="mono">${escaped(health.finalBlock)}</span>.` : 'A live backend check has not passed. Wallet actions cannot continue until it does.'}</p>`);
}
function overview() {
  const connected = !!state.session;
  return heading('NEAR TESTNET', connected ? 'Your workspace is connected.' : 'Connect your testnet wallet.',
    'Scrim reads live chain state and keeps account actions behind a fresh wallet signature.',
    connected ? button('Refresh data','refresh','secondary') : button('Connect Meteor','connect')) +
    `<div class="overview-grid">${panel(`<span class="panel-label">SIGNED ACCOUNT</span><h3>${connected ? escaped(state.session.accountId) : 'No authenticated account'}</h3><p class="muted" style="margin-top:10px">${connected ? 'This session expires automatically. Scrim never receives your private key.' : 'Connect Meteor and approve a NEP-413 message to open a 15-minute session.'}</p>`)}${statusCard()}</div>` +
    `${state.contract ? panel(`<span class="panel-label">REVIEWED TREASURY CONTRACT</span><h3>${escaped(state.contract.accountId)}</h3><p class="muted" style="margin-top:10px">Owner ${escaped(state.contract.config.signer_accounts.join(', '))} · ${state.contract.config.threshold}-of-${state.contract.config.signer_accounts.length} · policy version ${escaped(state.contract.policyVersion)} · ${state.contract.accessKeyCount} account key(s) remain.</p>`) : panel('<span class="panel-label">TREASURY</span><h3>Review a deployed contract</h3><p class="muted" style="margin-top:10px">Enter a testnet contract account under Treasury to see its finalized policy. No balance is shown without an authenticated account.</p>')}`;
}
function treasury() {
  const rows = state.treasuries.map(t => `<div class="export-row"><div><h3>${escaped(t.config.contractAccountId)}</h3><p>${escaped(t.config.kind)} · ${escaped(t.config.signerAccounts.join(', '))}</p></div><span class="status ${escaped(t.status)}">${escaped(t.status.replaceAll('_',' '))}</span></div>`).join('');
  return heading('TREASURY', 'Review and authorize your policy.', 'Read finalized on-chain configuration, then sign a separate configuration intent if you own it.') +
    panel(`<form id="contract-form"><label class="field">Deployed NEAR testnet contract<input name="contractId" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="contract.testnet" value="${escaped(state.contractId)}" required></label><button class="button primary" type="submit">Read finalized contract</button></form>`) +
    (state.contract ? panel(`<span class="panel-label">FINALIZED CONFIGURATION</span><h3>${escaped(state.contract.accountId)}</h3><div class="detail-list"><div><span>Owner</span><b>${escaped(state.contract.config.signer_accounts.join(', '))}</b></div><div><span>Threshold</span><b>${state.contract.config.threshold}-of-${state.contract.config.signer_accounts.length}</b></div><div><span>Policy version</span><b>${escaped(state.contract.policyVersion)}</b></div><div><span>Deployment keys</span><b>${state.contract.accessKeyCount}</b></div><div><span>Code hash</span><b class="mono">${escaped(state.contract.codeHash)}</b></div></div><p class="muted">${state.contract.accessKeyCount ? 'Activation is blocked while the deployment account retains an access key. The policy is readable; no value may move through it.' : 'The contract account is keyless. Scrim can now check this configuration against a signed intent.'}</p>${state.session && state.contract.config.signer_accounts.includes(state.session.accountId) ? `<div class="actions" style="margin-top:20px">${button('Sign configuration intent','create-intent')}</div>` : ''}`) : '') +
    panel(`<span class="panel-label">YOUR SIGNED INTENTS</span><h3>Configuration requests</h3>${state.session ? (rows || '<p class="muted" style="margin-top:12px">No configuration request has been signed by this account.</p>') : '<p class="muted" style="margin-top:12px">Connect Meteor to see requests belonging to your account.</p>'}`);
}
function unavailable(label,title,detail) { return heading(label,title,detail) + panel('<span class="panel-label">TESTNET AVAILABILITY</span><h3>Execution is not enabled</h3><p class="muted" style="margin-top:10px">The deployed policy contract only governs configuration. Scrim will enable this action after the corresponding settlement or proving implementation passes its release checks.</p>'); }
function settings() { return heading('SETTINGS','Account and network.','Control your testnet session and inspect its source.') + `<div class="settings">${panel(`<span class="panel-label">WALLET SESSION</span><h3>${state.session ? escaped(state.session.accountId) : 'No authenticated account'}</h3><p class="muted" style="margin:10px 0 18px">${state.session ? `NEAR testnet · expires ${escaped(new Date(state.session.expiresAt).toLocaleString())}` : 'Meteor signs locally. Scrim verifies the public access key on NEAR testnet.'}</p>${state.session ? button('Sign out','disconnect','secondary') : button('Connect Meteor','connect')}`)}${statusCard()}</div>`; }
const pages = { overview, treasury, payments:()=>unavailable('PAYMENTS','Private payments.','The first USDC NEAR → Base corridor is being wired to Confidential Intents.'), agents:()=>unavailable('AGENT RAILS','Bounded agent spending.','Request-only agent actions and strict policy enforcement are under construction.'), proofs:()=>unavailable('DISCLOSURES','Reader-bound proofs.','The circuit and public inputs must be finalized before any proof is issued.'), settings };

function render() {
  view = location.hash.slice(1) || 'overview'; if (!pages[view]) view = 'overview';
  $('#crumb').textContent = navItems.find(([id]) => id === view)[1];
  $('#nav').innerHTML = navItems.map(([id,name]) => `<a href="#${id}" class="${id === view ? 'active' : ''}">${name}</a>`).join('');
  $('#main').innerHTML = `${state.error ? `<div class="notice" role="alert">${escaped(state.error)}</div>` : ''}${pages[view]()}`;
  $('#sidebar').classList.remove('open'); $('#menu').setAttribute('aria-expanded','false');
}
async function connect() {
  if (!state.health || state.health.status !== 'online') throw Error('The testnet backend is unavailable. Try Refresh data.');
  const { connectMeteor, signMeteorChallenge } = await meteorWallet();
  const wallet = await connectMeteor();
  const challenge = await api('/api/v1/auth/challenge',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:wallet.identifier.accountId}) });
  const signed = await signMeteorChallenge(wallet,challenge);
  const result = await api('/api/v1/auth/verify',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:challenge.id,state:challenge.state,signed}) });
  state.wallet = wallet; state.session = result; state.csrf = result.csrf;
  sessionStorage.setItem('scrim-auth-csrf',JSON.stringify({accountId:result.accountId,csrf:result.csrf,expiresAt:result.expiresAt}));
  state.treasuries = (await api('/api/v1/treasuries')).treasuries;
  render();
}
async function createIntent() {
  if (!state.session || !state.csrf || !state.contract) throw Error('Connect and authenticate your wallet first.');
  const { signMeteorChallenge } = await meteorWallet();
  const c = state.contract.config;
  if (c.kind !== 'individual' || c.threshold !== 1 || c.signer_accounts.length !== 1 || c.signer_accounts[0] !== state.session.accountId) throw Error('This account is not the individual owner of the selected contract.');
  const action = { kind:'individual', contractAccountId:state.contract.accountId, signerAccounts:[state.session.accountId], threshold:1, policyCommitment:c.policy_commitment };
  const headers = { 'content-type':'application/json','x-csrf-token':state.csrf };
  const challenge = await api('/api/v1/auth/challenge',{method:'POST',headers,body:JSON.stringify({accountId:state.session.accountId,purpose:'treasury:create',action})});
  const signed = await signMeteorChallenge(state.wallet,challenge);
  await api('/api/v1/treasuries',{method:'POST',headers:{...headers,'idempotency-key':crypto.randomUUID()},body:JSON.stringify({id:challenge.id,state:challenge.state,signed,action})});
  state.treasuries = (await api('/api/v1/treasuries')).treasuries;
  render();
}
async function disconnect() {
  const { disconnectMeteor } = await meteorWallet();
  if (state.session && state.csrf) await api('/api/v1/auth/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},body:'{}'});
  if (state.wallet) await disconnectMeteor(state.wallet);
  state.wallet=null; state.session=null; state.csrf=null; state.treasuries=[];
  sessionStorage.removeItem('scrim-auth-csrf'); render();
}
async function run(operation) { if (state.busy) return; state.busy=true; state.error=''; try { await operation(); } catch(error) { report(error); } finally { state.busy=false; } }
document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if (action==='connect') run(connect);
  if (action==='refresh') run(refresh);
  if (action==='create-intent') run(createIntent);
  if (action==='disconnect') run(disconnect);
});
document.addEventListener('submit',event=>{
  if (event.target.id==='contract-form') { event.preventDefault(); run(()=>readContract(new FormData(event.target).get('contractId').trim())); }
});
$('#menu').addEventListener('click',()=>{ const open=$('#sidebar').classList.toggle('open'); $('#menu').setAttribute('aria-expanded',String(open)); });
window.addEventListener('hashchange',render);
render();
await run(async()=>{
  state.contractId=sessionStorage.getItem('scrim-testnet-contract') || '';
  try { state.health=await api('/api/health'); } catch { state.health=null; }
  try {
    const session=await api('/api/v1/auth/session');
    const saved=JSON.parse(sessionStorage.getItem('scrim-auth-csrf') || 'null');
    const { currentMeteorAccount } = await meteorWallet();
    const wallet=await currentMeteorAccount();
    if (wallet?.identifier?.accountId===session.accountId) {
      state.wallet=wallet; state.session={...session,csrf:saved?.accountId===session.accountId?saved.csrf:null};
      state.csrf=state.session.csrf;
      state.treasuries=(await api('/api/v1/treasuries')).treasuries;
    }
  } catch { /* An expired session displays a disconnected workspace. */ }
  if (state.contractId) try { await readContract(state.contractId); } catch { state.contract=null; }
  render();
});

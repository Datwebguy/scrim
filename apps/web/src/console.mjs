import { prepareMeteorConnection, openPreparedMeteorConnection, currentMeteorAccount, signMeteorChallenge, disconnectMeteor } from './wallet.mjs';

const $ = selector => document.querySelector(selector);
const escaped = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const button = (label, action, style = 'primary', disabled = false) => `<button class="button ${style}" type="button" data-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`;
const panel = (content, extra = '') => `<section class="panel panel-pad ${extra}">${content}</section>`;
const heading = (title, detail = '', actions = '') => `<div class="page-head"><div><h1>${title}</h1>${detail ? `<p>${detail}</p>` : ''}</div><div class="actions">${actions}</div></div>`;
const navItems = [['overview','Home'],['payments','Payments'],['proofs','Proofs'],['agents','Agents'],['team','Team wallet'],['settings','Wallet']];
const state = { wallet:null, session:null, csrf:null, health:null, contract:null, contractId:'', treasuries:[], busy:false, walletOpening:false, walletReady:false, progress:'', error:'' };
let view = 'overview';

async function api(path, options = {}) {
  const response = await fetch(path, { credentials:'same-origin', cache:'no-store', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || `Request failed (${response.status})`);
  return data;
}
function humanError(error) {
  const message = String(error?.message || error);
  if (/cancelled/i.test(message)) return 'Connection was cancelled.';
  if (/Meteor did not return/i.test(message)) return 'Meteor did not complete the connection. Choose Meteor Mobile or Meteor Web, then approve the request.';
  if (/Failed to fetch|service_unavailable/i.test(message)) return 'Scrim could not reach the service. Please try again.';
  return message.replaceAll('_', ' ');
}
function closeNav() {
  $('#sidebar').classList.remove('open');
  $('#drawer-backdrop').classList.remove('open');
  $('#menu').setAttribute('aria-expanded','false');
  $('#menu').setAttribute('aria-label','Open navigation');
}
function toggleNav() {
  const open = !$('#sidebar').classList.contains('open');
  $('#sidebar').classList.toggle('open', open);
  $('#drawer-backdrop').classList.toggle('open', open);
  $('#menu').setAttribute('aria-expanded',String(open));
  $('#menu').setAttribute('aria-label',open ? 'Close navigation' : 'Open navigation');
}
function serviceReady() { return state.health?.status === 'online'; }
async function readContract(id) {
  if (!/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(id)) throw Error('Enter a valid testnet contract name.');
  state.contract = await api(`/api/testnet-contract?accountId=${encodeURIComponent(id)}`);
  state.contractId = id;
  sessionStorage.setItem('scrim-testnet-contract', id);
}
function connectionCard() {
  if (state.session) return panel(`<span class="panel-label">CONNECTED</span><h2>${escaped(state.session.accountId)}</h2><p class="muted">Your wallet is connected to this private workspace.</p><div class="actions card-actions"><a class="button primary" href="#payments">Open payments</a>${button('Disconnect','disconnect','secondary')}</div>`, 'hero-panel');
  const label = state.walletOpening ? 'Opening wallet…' : state.walletReady ? 'Connect wallet' : 'Preparing secure wallet…';
  return panel(`<span class="panel-label">PRIVATE PAYMENTS</span><h1>Money that stays yours.</h1><p>Connect your wallet to pay privately, set agent limits, and share only the proof someone needs.</p><div class="actions card-actions">${button(label,'connect','primary',state.walletOpening || !state.walletReady)}</div><small class="connection-note">${state.progress || (state.walletReady ? 'Meteor Web continues in this browser. Meteor Mobile is for the installed app.' : 'Getting a secure wallet connection ready…')}</small>`, 'hero-panel');
}
function featureCard(title, copy, href, stateLabel) {
  return `<a class="feature-card" href="${href}"><span>${stateLabel}</span><h3>${title}</h3><p>${copy}</p><b>Open →</b></a>`;
}
function overview() {
  const detail = state.session ? 'Start with a payment, a proof, or an agent policy.' : 'Your private key stays in your wallet.';
  return heading('Private money, with control.', detail) + connectionCard() + `<div class="feature-grid">${featureCard('Payments','Move USDC without making your counterparties and amount public.','#payments','PAY')}${featureCard('Proofs','Share a receipt, solvency check, or payroll total with one reader.','#proofs','PROVE')}${featureCard('Agents','Give an agent a cap and approved payees before it can act.','#agents','CONTROL')}</div>`;
}
function team() {
  const contract = state.contract;
  const canSign = state.session && contract?.config.signer_accounts.includes(state.session.accountId);
  const pending = state.treasuries.filter(t => t.status === 'awaiting_chain_confirmation').length;
  const intro = contract ? 'These are the approval rules currently found on testnet.' : 'Use this space when more than one person must approve a payment.';
  return heading('Team wallet', intro) +
    panel(`<form id="contract-form" class="contract-form"><label class="field">Team wallet contract<input name="contractId" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="scrim.testnet" value="${escaped(state.contractId)}" required></label><button class="button primary" type="submit">Check approval rules</button></form>`) +
    (contract ? panel(`<span class="panel-label">${escaped(contract.accountId)}</span><h2>${contract.config.threshold}-of-${contract.config.signer_accounts.length} approval</h2><div class="detail-list"><div><span>Owners</span><b>${escaped(contract.config.signer_accounts.join(', '))}</b></div><div><span>Policy</span><b>Version ${escaped(contract.policyVersion)}</b></div><div><span>Activation</span><b>${contract.accessKeyCount ? 'Needs final setup' : 'Ready to confirm'}</b></div></div>${canSign ? `<div class="actions">${button(state.busy ? 'Preparing…' : 'Confirm this policy','create-intent','primary',state.busy)}</div>` : '<p class="muted">Connect the owner wallet to confirm this policy.</p>'}`) : panel('<h2>No contract selected</h2><p class="muted">Enter your testnet contract above to continue.</p>')) +
    (pending ? panel(`<span class="panel-label">PENDING</span><h2>${pending} policy confirmation${pending === 1 ? '' : 's'}</h2><p class="muted">A signed policy is waiting for its final on-chain check.</p>`) : '');
}
function payments() {
  return heading('Payments', 'Private USDC settlement from NEAR to Base starts here.') + panel(`<span class="panel-label">PRIVATE SETTLEMENT</span><h2>Send without publishing the details.</h2><p class="muted">Connect a wallet first. Scrim will show a payment form only when its private settlement path is live on testnet.</p>`);
}
function proofs() {
  return heading('Proofs', 'Disclose one fact to one named reader, then let it expire.') + panel(`<span class="panel-label">SELECTIVE DISCLOSURE</span><h2>Share what is necessary.</h2><p class="muted">Receipt, solvency, and payroll-total proofs will be generated on your device and bound to the reader and expiry.</p>`);
}
function agents() {
  return heading('Agents', 'Give an agent a defined job, a spending cap, and approved payees.') + panel(`<span class="panel-label">AGENT CONTROLS</span><h2>Agents begin by asking.</h2><p class="muted">Every agent starts in request-only mode. Autonomous payments require an explicit opt-in and remain inside its cap and payee list.</p>`);
}
function settings() {
  const label = state.walletOpening ? 'Opening wallet…' : state.walletReady ? 'Connect wallet' : 'Preparing secure wallet…';
  return heading('Wallet', state.session ? 'Your current workspace connection.' : 'Connect a wallet to begin.') + panel(`<span class="panel-label">WALLET</span><h2>${state.session ? escaped(state.session.accountId) : 'Not connected'}</h2><p class="muted">${state.session ? 'Connected on NEAR testnet.' : 'Meteor keeps your signing key in your wallet.'}</p><div class="actions card-actions">${state.session ? button('Disconnect','disconnect','secondary') : button(label,'connect','primary',state.walletOpening || !state.walletReady)}</div>`) + panel(`<details class="service-details"><summary>Service status</summary><p>Testnet connection: ${serviceReady() ? 'online' : 'checking'}.</p>${state.contract ? `<p>Reviewed contract: ${escaped(state.contract.accountId)}.</p>` : ''}</details>`);
}
const pages = { overview, payments, proofs, agents, team, settings };

function render() {
  view = location.hash.slice(1) || 'overview'; if (!pages[view]) view = 'overview';
  $('#crumb').textContent = navItems.find(([id]) => id === view)[1];
  $('#nav').innerHTML = navItems.map(([id,name]) => `<a href="#${id}" class="${id === view ? 'active' : ''}">${name}</a>`).join('');
  $('#main').innerHTML = `${state.error ? `<div class="notice" role="alert">${escaped(state.error)}</div>` : ''}${pages[view]()}`;
  closeNav();
}
async function connect() {
  if (!state.walletReady) throw Error('Your secure wallet connection is still getting ready.');
  state.walletOpening=true;
  try {
    // Prompt a pre-created action immediately. Do not await before this call:
    // mobile browsers require the wallet opening to originate from the user's tap.
    const walletPromise = openPreparedMeteorConnection();
    state.progress='Choose Meteor Web to continue in your browser, or Meteor Mobile when you use the installed app.'; render();
    const wallet = await walletPromise;
    state.progress='Confirm the secure sign-in message in Meteor.'; render();
    const challenge = await api('/api/v1/auth/challenge',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:wallet.identifier.accountId}) });
    const signed = await signMeteorChallenge(wallet,challenge);
    const result = await api('/api/v1/auth/verify',{ method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:challenge.id,state:challenge.state,signed}) });
    state.wallet = wallet; state.session = result; state.csrf = result.csrf;
    sessionStorage.setItem('scrim-auth-csrf',JSON.stringify({accountId:result.accountId,csrf:result.csrf,expiresAt:result.expiresAt}));
    state.treasuries = (await api('/api/v1/treasuries')).treasuries;
  } finally {
    state.walletOpening=false;
    // A Meteor action is consumed once it is opened. Prepare the next one after
    // completion or cancellation so a second tap always has a fresh action.
    state.walletReady=false;
    void warmMeteor();
  }
}
async function createIntent() {
  if (!state.session || !state.csrf || !state.contract) throw Error('Connect the owner wallet first.');
  const c = state.contract.config;
  if (c.kind !== 'individual' || c.threshold !== 1 || c.signer_accounts.length !== 1 || c.signer_accounts[0] !== state.session.accountId) throw Error('This wallet is not the owner of the selected contract.');
  const action = { kind:'individual', contractAccountId:state.contract.accountId, signerAccounts:[state.session.accountId], threshold:1, policyCommitment:c.policy_commitment };
  const headers = { 'content-type':'application/json','x-csrf-token':state.csrf };
  const challenge = await api('/api/v1/auth/challenge',{method:'POST',headers,body:JSON.stringify({accountId:state.session.accountId,purpose:'treasury:create',action})});
  const signed = await signMeteorChallenge(state.wallet,challenge);
  await api('/api/v1/treasuries',{method:'POST',headers:{...headers,'idempotency-key':crypto.randomUUID()},body:JSON.stringify({id:challenge.id,state:challenge.state,signed,action})});
  state.treasuries = (await api('/api/v1/treasuries')).treasuries;
}
async function disconnect() {
  if (state.session && state.csrf) await api('/api/v1/auth/logout',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':state.csrf},body:'{}'});
  if (state.wallet) await disconnectMeteor(state.wallet);
  state.wallet=null; state.session=null; state.csrf=null; state.treasuries=[];
  sessionStorage.removeItem('scrim-auth-csrf');
}
async function run(operation) {
  if (state.busy) return;
  state.busy=true; state.progress=''; state.error=''; render();
  try { await operation(); }
  catch(error) { state.error=humanError(error); }
  finally { state.busy=false; state.progress=''; render(); }
}
document.addEventListener('click',event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;
  if (action==='connect') run(connect);
  if (action==='create-intent') run(createIntent);
  if (action==='disconnect') run(disconnect);
});
document.addEventListener('submit',event=>{
  if (event.target.id==='contract-form') { event.preventDefault(); run(()=>readContract(new FormData(event.target).get('contractId').trim())); }
});
$('#menu').addEventListener('click',toggleNav);
$('#drawer-backdrop').addEventListener('click',closeNav);
document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeNav(); });
window.addEventListener('hashchange',render);
render();
// Begin preparing Meteor immediately. This never opens a wallet; it only makes the later wallet
// request start inside the user's tap, which mobile browsers require for the deep link.
function warmMeteor() {
  return prepareMeteorConnection().then(() => {
    state.walletReady=true;
    render();
  }).catch(() => {
    state.walletReady=false;
    render();
  });
}
void warmMeteor();
await run(async()=>{
  state.contractId=sessionStorage.getItem('scrim-testnet-contract') || '';
  try { state.health=await api('/api/health'); } catch { state.health=null; }
  try {
    const session=await api('/api/v1/auth/session');
    const saved=JSON.parse(sessionStorage.getItem('scrim-auth-csrf') || 'null');
    const wallet=await currentMeteorAccount();
    if (wallet?.identifier?.accountId===session.accountId) {
      state.wallet=wallet; state.session={...session,csrf:saved?.accountId===session.accountId?saved.csrf:null};
      state.csrf=state.session.csrf;
      state.treasuries=(await api('/api/v1/treasuries')).treasuries;
    }
  } catch { /* A disconnected or expired wallet simply shows the welcome state. */ }
  if (state.contractId) try { await readContract(state.contractId); } catch { state.contract=null; }
});

const main = document.querySelector('#main');
function mountAccountCheck() {
  if (location.hash !== '#settings' || document.querySelector('#near-account-check')) return;
  const settings = document.querySelector('.settings');
  if (!settings) return;
  const section = document.createElement('section');
  section.className = 'panel panel-pad';
  section.id = 'near-account-check';
  section.innerHTML = `<h3>Check a NEAR account</h3><p class="muted" style="margin-top:8px">This checks the account directly against NEAR mainnet. It does not connect a wallet, request a signature, or save an account.</p><form class="section-gap"><label class="field">NEAR account ID<input name="accountId" autocomplete="off" placeholder="your-account.near" required></label><p class="error" role="status"></p><button class="button primary" type="submit">Check mainnet account</button></form>`;
  settings.prepend(section);
  const form = section.querySelector('form');
  const result = section.querySelector('[role=status]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); result.className = 'muted'; result.textContent = 'Checking NEAR mainnet…';
    try { const response = await fetch('/api/near-account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId: new FormData(form).get('accountId') }) }); const payload = await response.json(); result.className = response.ok ? 'muted' : 'error'; result.textContent = response.ok ? `${payload.accountId} exists on NEAR mainnet.` : payload.error; }
    catch { result.className = 'error'; result.textContent = 'Could not reach Scrim’s network service.'; }
  });
}
new MutationObserver(mountAccountCheck).observe(main, { childList: true });
mountAccountCheck();

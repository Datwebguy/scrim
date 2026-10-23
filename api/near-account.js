const ACCOUNT_ID = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const accountId = String(request.body?.accountId || '').trim().toLowerCase();
  if (!ACCOUNT_ID.test(accountId) || accountId.length > 64) {
    return response.status(400).json({ error: 'Enter a valid NEAR account ID.' });
  }

  try {
    const upstream = await fetch('https://rpc.testnet.near.org', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'scrim-account-check',
        method: 'query',
        params: { request_type: 'view_account', finality: 'final', account_id: accountId },
      }),
    });
    const payload = await upstream.json();
    if (payload.error) return response.status(404).json({ error: 'Account was not found on NEAR testnet.' });
    return response.status(200).json({ accountId, exists: true, network: 'testnet', blockHeight: payload.result?.block_height });
  } catch {
    return response.status(503).json({ error: 'NEAR testnet is temporarily unavailable. Try again shortly.' });
  }
}

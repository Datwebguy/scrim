import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { makeHandler } from './handler.mjs';
import { runtime } from './runtime.mjs';
import { getRedisClient } from '../../../packages/storage/src/redis.mjs';

const secret = process.env.SCRIM_PROXY_SECRET;
if (!secret || secret.length < 32) throw Error('SCRIM_PROXY_SECRET is required');
if (process.env.SCRIM_NETWORK !== 'testnet') throw Error('This backend release is testnet only');

function authorized(value) {
  if (typeof value !== 'string') return false;
  const supplied = Buffer.from(value), expected = Buffer.from(secret);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

const handler = makeHandler(runtime);
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!authorized(req.headers['x-scrim-proxy-secret'])) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end('{"error":"proxy_auth_required"}');
    return;
  }
  res.status = code => { res.statusCode = code; return res; };
  res.json = data => { res.setHeader('content-type', 'application/json; charset=utf-8'); res.end(JSON.stringify(data)); return res; };
  try {
    if (req.url === '/api/health' && req.method === 'GET') {
      const rt = await runtime();
      await rt.repo.db.query('SELECT 1');
      await (await getRedisClient()).ping();
      const block = await rt.treasury.rpc.finalBlock();
      return res.status(200).json({ service: 'scrim', status: 'online', network: rt.treasury.network, finalBlock: block.hash,
        capabilities: { walletAuthentication: true, treasuryConfiguration: true, treasuryActivation: false, privatePayments: false } });
    }
    if (req.method === 'POST') {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 96000) return res.status(413).json({ error: 'request_too_large' });
      }
      try { req.body = JSON.parse(raw || '{}'); }
      catch { return res.status(400).json({ error: 'invalid_json' }); }
    }
    await handler(req, res);
  } catch {
    if (!res.headersSent) res.status(503).json({ error: 'service_unavailable' });
    else res.end();
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0');

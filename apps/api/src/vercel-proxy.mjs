export async function proxy(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const upstream = process.env.SCRIM_API_UPSTREAM, secret = process.env.SCRIM_PROXY_SECRET;
  if (!upstream || !secret) return response.status(503).json({ error: 'service_not_configured' });
  try {
    const path = new URL(request.url, 'https://scrim.local').pathname;
    if (!/^\/api\/(health|v1\/)/.test(path)) return response.status(404).json({ error: 'route_not_found' });
    const headers = { 'x-scrim-proxy-secret': secret };
    for (const name of ['content-type', 'cookie', 'origin', 'x-csrf-token', 'idempotency-key']) {
      const value = request.headers[name]; if (typeof value === 'string') headers[name] = value;
    }
    const ip = request.headers['x-forwarded-for'];
    if (typeof ip === 'string') headers['x-scrim-client-ip'] = ip.split(',')[0].trim();
    const body = request.method === 'POST' ? (typeof request.body === 'string' ? request.body : JSON.stringify(request.body ?? {})) : undefined;
    const result = await fetch(new URL(path, upstream), { method: request.method, headers, body, signal: AbortSignal.timeout(15000) });
    const cookies = result.headers.getSetCookie();
    if (cookies.length) response.setHeader('Set-Cookie', cookies);
    return response.status(result.status).json(await result.json());
  } catch {
    return response.status(503).json({ error: 'service_unavailable' });
  }
}

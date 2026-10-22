import { createHash, createPublicKey, verify } from 'node:crypto';
import { requireThat } from '../../protocol/src/index.mjs';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function fromBase58(text) {
  requireThat(typeof text === 'string' && text.length > 0 && text.length < 160, 'invalid_base58');
  let n = 0n;
  for (const c of text) { const v = alphabet.indexOf(c); requireThat(v !== -1, 'invalid_base58'); n = n * 58n + BigInt(v); }
  let hex = n ? n.toString(16) : ''; if (hex.length % 2) hex = '0' + hex;
  let leading = 0; while (text[leading] === '1') leading++;
  return Buffer.concat([Buffer.alloc(leading), Buffer.from(hex, 'hex')]);
}
export function u32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }
export const borshString = s => { const b = Buffer.from(s); return Buffer.concat([u32(b.length), b]); };
export function timestampNs(value) {
  requireThat(typeof value === 'string', 'invalid_timestamp');
  const m = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d{1,9}))?Z$/.exec(value);
  requireThat(m, 'invalid_timestamp');
  const ms = Date.parse(m[1] + 'Z'); requireThat(Number.isFinite(ms), 'invalid_timestamp');
  requireThat(new Date(ms).toISOString().slice(0,19) === m[1], 'invalid_timestamp');
  return BigInt(ms) * 1000000n + BigInt((m[2] ?? '').padEnd(9, '0'));
}
export function nep641Hash(msg) {
  const ts = Buffer.alloc(8); ts.writeBigUInt64LE(timestampNs(msg.timestamp));
  const path = msg.path ?? [];
  return createHash('sha3-256').update(Buffer.concat([
    Buffer.from('NEAR_NEP641_OFFCHAIN_MESSAGE/V1'), borshString(msg.chain_id), borshString(msg.signer_id),
    u32(path.length), ...path.map(borshString), ts, borshString(msg.payload),
  ])).digest();
}
export function nep413Hash({ message, nonce, recipient, callbackUrl }) {
  requireThat(Buffer.from(nonce).length === 32, 'invalid_nonce');
  return createHash('sha256').update(Buffer.concat([
    u32(2147484061), borshString(message), Buffer.from(nonce), borshString(recipient),
    callbackUrl === undefined ? Buffer.from([0]) : Buffer.concat([Buffer.from([1]), borshString(callbackUrl)]),
  ])).digest();
}
export function nep641SigningParams(msg, callbackUrl) {
  const path = msg.path ?? [];
  const recipient = `${msg.chain_id}: ${msg.signer_id}${path.map(id => ' -> ' + id).join('')} @ ${msg.timestamp.replace(/\.\d+Z$/, 'Z')}`;
  return { message: msg.payload, nonce: nep641Hash(msg), recipient, ...(callbackUrl === undefined ? {} : { callbackUrl }) };
}
export function verifyEd25519(publicKey, signature, digest, encoding = 'base64') {
  requireThat(publicKey.startsWith('ed25519:'), 'unsupported_access_key_curve');
  const key = fromBase58(publicKey.slice(8));
  requireThat(key.length === 32, 'invalid_public_key');
  const sig = encoding === 'base58' ? fromBase58(signature) : Buffer.from(signature, 'base64');
  requireThat(sig.length === 64, 'invalid_signature');
  const object = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), key]), format: 'der', type: 'spki' });
  requireThat(verify(null, digest, object, sig), 'invalid_signature', 401);
}

import { createHash } from 'node:crypto';
export class ScrimError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function requireThat(condition, code, status = 400) { if (!condition) throw new ScrimError(code, status); }
export function accountId(value) {
  requireThat(typeof value === 'string' && value.length >= 2 && value.length <= 64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(value), 'invalid_account');
  return value;
}
export const hash = value => createHash('sha256').update(value).digest('hex');
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  requireThat(value !== undefined, 'undefined_value');
  return JSON.stringify(value);
}
export const commitment = value => hash('SCRIM_V1\0' + canonical(value));
export function treasuryConfig(input, actor) {
  requireThat(input && typeof input === 'object' && !Array.isArray(input), 'invalid_treasury');
  requireThat(Object.keys(input).every(k => ['kind','contractAccountId','signerAccounts','threshold','policyCommitment'].includes(k)), 'unknown_treasury_field');
  requireThat(input.kind === 'individual' || input.kind === 'team', 'invalid_kind');
  const contractAccountId = accountId(input.contractAccountId);
  requireThat(Array.isArray(input.signerAccounts), 'missing_signers');
  const signerAccounts = input.signerAccounts.map(accountId).sort();
  requireThat(!signerAccounts.includes(contractAccountId), 'contract_cannot_be_own_signer');
  requireThat(new Set(signerAccounts).size === signerAccounts.length && signerAccounts.includes(actor), 'invalid_signers');
  requireThat(input.kind === 'individual' ? signerAccounts.length === 1 : signerAccounts.length >= 3 && signerAccounts.length <= 25, 'invalid_signer_count');
  const threshold = input.threshold ?? (input.kind === 'individual' ? 1 : 2);
  requireThat(Number.isInteger(threshold) && threshold >= (input.kind === 'individual' ? 1 : 2) && threshold <= signerAccounts.length, 'invalid_threshold');
  requireThat(typeof input.policyCommitment === 'string' && /^[a-f0-9]{64}$/.test(input.policyCommitment), 'invalid_policy_commitment');
  return { kind: input.kind, contractAccountId, signerAccounts, threshold, policyCommitment: input.policyCommitment };
}

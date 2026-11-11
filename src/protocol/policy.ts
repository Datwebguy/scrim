// The mandate policy engine. Pure and deterministic: the server calls it before any
// request can reach approval, and the UI calls the same code to preview a decision.
import { formatAmount } from "./amount";
import { commitment } from "./canonical";

type Counterparty = { address: string; label: string };

export type MandatePolicy = {
  version: number;
  perActionCap: string; // USDC minor units
  rollingCap: { amount: string; windowSeconds: number };
  counterparties: Counterparty[];
  expiresAt: string | null;
};

type PolicyRule = "active" | "counterparty" | "per_action_cap" | "rolling_cap" | "expiry";
// `code` is a stable name for why a request was refused, so software can act on it without reading the sentence.
type PolicyCheck = { rule: PolicyRule; code?: string; passed: boolean; detail: string };

const REFUSAL_CODE: Record<PolicyRule, string> = {
  active: "AGENT_PAUSED",
  expiry: "MANDATE_EXPIRED",
  counterparty: "RECIPIENT_NOT_ALLOWED",
  per_action_cap: "OVER_PAYMENT_LIMIT",
  rolling_cap: "OVER_WINDOW_LIMIT",
};

export type PolicyDecision = {
  allowed: boolean;
  // Inside its limits, but a person confirms it first: it repeats a recent request, which is what a fake "payment failed, retry" note asks for.
  hold?: { reason: "repeat"; detail: string };
  checks: PolicyCheck[];
  policyVersion: number;
  policyCommitment: string;
};

type PolicyUnit = { symbol: string; decimals: number };

export type PolicyInput = {
  recipient: string;
  unit?: PolicyUnit;
  amount: bigint;
  spentInWindow: bigint; // committed spend inside the rolling window, excluding this request
  enabled: boolean;
  now?: Date;
};

export function policyCommitment(policy: MandatePolicy): string {
  return commitment("mandate-policy", {
    ...policy,
    counterparties: [...policy.counterparties].map((c) => c.address).sort(),
  });
}

export function evaluatePolicy(policy: MandatePolicy, input: PolicyInput): PolicyDecision {
  const now = input.now ?? new Date();
  const perAction = BigInt(policy.perActionCap);
  const rolling = BigInt(policy.rollingCap.amount);
  const afterSpend = input.spentInWindow + input.amount;
  const match = policy.counterparties.find((c) => c.address === input.recipient);
  const windowLabel = describeWindow(policy.rollingCap.windowSeconds);
  const unit = input.unit ?? { symbol: "USDC", decimals: 6 };
  const show = (minor: bigint) => `${formatAmount(minor, unit.decimals)} ${unit.symbol}`;

  const live = !policy.expiresAt || new Date(policy.expiresAt) > now;
  const underPerAction = input.amount > 0n && input.amount <= perAction;
  const underRolling = afterSpend <= rolling;
  // Each line says what happened: a check that failed never reads as passed.
  const checks: PolicyCheck[] = [
    {
      rule: "active",
      passed: input.enabled,
      detail: input.enabled ? "The agent is switched on." : "The agent is paused by its owner.",
    },
    {
      rule: "expiry",
      passed: live,
      detail: !policy.expiresAt ? "Its limits have no end date." : live ? `Its limits apply until ${new Date(policy.expiresAt).toUTCString()}.` : `Its permission ended on ${new Date(policy.expiresAt).toUTCString()}.`,
    },
    {
      rule: "counterparty",
      passed: Boolean(match),
      detail: match ? `${match.label} is an allowed recipient.` : "This recipient isn't on the allowed list.",
    },
    {
      rule: "per_action_cap",
      passed: underPerAction,
      detail: underPerAction ? `${show(input.amount)}, within the ${show(perAction)} limit per payment.` : input.amount > 0n ? `${show(input.amount)} is over the ${show(perAction)} limit per payment.` : "The amount must be more than zero.",
    },
    {
      rule: "rolling_cap",
      passed: underRolling,
      detail: underRolling ? `${show(afterSpend)} of ${show(rolling)} used in the ${windowLabel} window after this request.` : `${show(afterSpend)} would be over the ${show(rolling)} limit for the ${windowLabel} window.`,
    },
  ];

  for (const c of checks) c.code = REFUSAL_CODE[c.rule];
  return {
    allowed: checks.every((c) => c.passed),
    checks,
    policyVersion: policy.version,
    policyCommitment: policyCommitment(policy),
  };
}

export function describeWindow(seconds: number): string {
  if (seconds % 86_400 === 0) return seconds === 86_400 ? "24-hour" : `${seconds / 86_400}-day`;
  if (seconds % 3_600 === 0) return `${seconds / 3_600}-hour`;
  return `${Math.round(seconds / 60)}-minute`;
}

// The one word an agent needs: go ahead, wait for a person, or stopped.
export type Verdict = "allowed" | "needs_person" | "refused";

export function verdictOf(decision: Pick<PolicyDecision, "allowed" | "hold">): Verdict {
  if (!decision.allowed) return "refused";
  return decision.hold ? "needs_person" : "allowed";
}

// Why a request was stopped, as stable codes with a plain sentence each.
export function refusalReasons(decision: Pick<PolicyDecision, "checks" | "hold">): { code: string; detail: string }[] {
  const failed = decision.checks.filter((c) => !c.passed).map((c) => ({ code: c.code ?? REFUSAL_CODE[c.rule], detail: c.detail }));
  return decision.hold ? [...failed, { code: "REPEAT_REQUEST", detail: decision.hold.detail }] : failed;
}

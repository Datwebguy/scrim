// The mandate policy engine. Pure and deterministic: the server calls it before any
// request can reach approval, and the UI calls the same code to preview a decision.
import { formatUsdc } from "./amount";
import { commitment } from "./canonical";

export type Counterparty = { address: string; label: string };

export type MandatePolicy = {
  version: number;
  perActionCap: string; // USDC minor units
  rollingCap: { amount: string; windowSeconds: number };
  counterparties: Counterparty[];
  expiresAt: string | null;
};

export type PolicyCheck = { rule: "active" | "counterparty" | "per_action_cap" | "rolling_cap" | "expiry"; passed: boolean; detail: string };

export type PolicyDecision = {
  allowed: boolean;
  checks: PolicyCheck[];
  policyVersion: number;
  policyCommitment: string;
};

export type PolicyInput = {
  recipient: string;
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

  const checks: PolicyCheck[] = [
    {
      rule: "active",
      passed: input.enabled,
      detail: input.enabled ? "Mandate is active." : "Mandate is paused by its owner.",
    },
    {
      rule: "expiry",
      passed: !policy.expiresAt || new Date(policy.expiresAt) > now,
      detail: policy.expiresAt ? `Mandate valid until ${new Date(policy.expiresAt).toUTCString()}.` : "Mandate has no expiry.",
    },
    {
      rule: "counterparty",
      passed: Boolean(match),
      detail: match ? `${match.label} is on the approved list.` : "Recipient is not on the approved list.",
    },
    {
      rule: "per_action_cap",
      passed: input.amount > 0n && input.amount <= perAction,
      detail: `${formatUsdc(input.amount)} against a ${formatUsdc(perAction)} per-action cap.`,
    },
    {
      rule: "rolling_cap",
      passed: afterSpend <= rolling,
      detail: `${formatUsdc(afterSpend)} of ${formatUsdc(rolling)} used in the ${windowLabel} window after this request.`,
    },
  ];

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

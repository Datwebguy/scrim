const DAY_MS = 86_400_000;

export function evaluatePayment(policy, payment, spentToday = 0) {
  const amount = Number(payment.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { allowed: false, reason: "Enter an amount greater than zero." };
  }
  if (!policy.approvedCounterparties.includes(payment.counterparty)) {
    return { allowed: false, reason: "Counterparty is not on the approved list." };
  }
  if (amount > policy.perPaymentLimit) {
    return { allowed: false, reason: `Payment exceeds the ${formatMoney(policy.perPaymentLimit)} per-payment limit.` };
  }
  if (spentToday + amount > policy.dailyLimit) {
    return { allowed: false, reason: `Payment would exceed the ${formatMoney(policy.dailyLimit)} daily limit.` };
  }
  if (amount >= policy.approvalThreshold) {
    return { allowed: true, needsApproval: true, reason: "A second approver is required before settlement." };
  }
  return { allowed: true, needsApproval: false, reason: "Payment complies with the active policy." };
}

export function createProof({ type, reader, expiresInMinutes, fact }, now = Date.now()) {
  const minutes = Math.max(1, Math.min(1440, Number(expiresInMinutes) || 15));
  const id = globalThis.crypto?.randomUUID?.() ?? `proof-${now}`;
  return {
    id,
    type,
    reader: reader.trim(),
    fact: fact.trim(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + minutes * 60_000).toISOString(),
    status: "active"
  };
}

export function proofStatus(proof, now = Date.now()) {
  return new Date(proof.expiresAt).getTime() <= now ? "expired" : proof.status;
}

export function formatMoney(value, currency = "USDC") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency === "USDC" ? "USD" : currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value).replace("$", "$ ");
}

export function resetAt(now = Date.now()) {
  const next = new Date(now + DAY_MS);
  next.setUTCHours(0, 0, 0, 0);
  return next.toISOString();
}

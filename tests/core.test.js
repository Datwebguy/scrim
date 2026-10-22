import test from "node:test";
import assert from "node:assert/strict";
import { createProof, evaluatePayment, proofStatus } from "../dist/core.js";

const policy = {
  approvedCounterparties: ["compute.near", "storage.near"],
  perPaymentLimit: 500,
  dailyLimit: 1200,
  approvalThreshold: 400
};

test("allows an approved payment within the cap", () => {
  assert.deepEqual(evaluatePayment(policy, { amount: 120, counterparty: "compute.near" }, 300), {
    allowed: true,
    needsApproval: false,
    reason: "Payment complies with the active policy."
  });
});

test("blocks an unapproved counterparty", () => {
  assert.equal(evaluatePayment(policy, { amount: 120, counterparty: "unknown.near" }, 0).allowed, false);
});

test("requires approval at the configured threshold", () => {
  assert.equal(evaluatePayment(policy, { amount: 450, counterparty: "storage.near" }, 0).needsApproval, true);
});

test("proofs expire at the configured time", () => {
  const proof = createProof({ type: "balance", reader: "audit.near", expiresInMinutes: 5, fact: "Balance ≥ $10,000" }, 1_000);
  assert.equal(proofStatus(proof, 300_999), "active");
  assert.equal(proofStatus(proof, 301_000), "expired");
});

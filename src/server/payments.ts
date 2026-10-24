import { randomUUID } from "node:crypto";
import { formatUsdc, parseAmount } from "@/protocol/amount";
import { commitment } from "@/protocol/canonical";
import { USDC_NEAR_TO_BASE } from "@/protocol/corridor";
import { normalizeEvmAddress } from "@/protocol/identifiers";
import { evaluatePolicy, type PolicyDecision } from "@/protocol/policy";
import { agentSpendInWindow, type Agent } from "./agents";
import { audit, type Actor } from "./audit";
import { consumeSignedChallenge, issueChallenge, type Session, type SignedEnvelope } from "./auth";
import { config } from "./config";
import { sql, type Tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { quoteProvider, refundAccountFor } from "./settlement";
import { treasuryForMember, type Treasury } from "./treasuries";

export type PaymentStatus = "policy_rejected" | "awaiting_approval" | "approved" | "quoted" | "submitting" | "settled" | "failed" | "expired" | "cancelled";

export type Payment = {
  id: string;
  treasuryId: string;
  createdBy: { type: "human" | "agent"; id: string; name?: string };
  corridor: string;
  recipient: string;
  amount: string;
  memo: string;
  policyVersion: number | null;
  policyDecision: PolicyDecision | null;
  commitment: string;
  status: PaymentStatus;
  expiresAt: Date;
  createdAt: Date;
  approvals: { accountId: string; createdAt: Date }[];
  quote: Quote | null;
};

export type Quote = {
  id: string;
  provider: string;
  confidentiality: string;
  amountIn: string;
  amountOut: string;
  minAmountOut: string;
  timeEstimateSeconds: number | null;
  deadline: Date;
  quoteCommitment: string;
  createdAt: Date;
};

export type CreatePaymentInput = { recipient: string; amount: string; memo?: string; idempotencyKey: string };

type PaymentRow = {
  id: string; treasury_id: string; created_by_type: "human" | "agent"; created_by_id: string; agent_name: string | null;
  corridor: string; recipient: string; amount: string; memo: string; policy_version: number | null; policy_decision: PolicyDecision | null;
  commitment: string; status: PaymentStatus; expires_at: Date; created_at: Date;
};

async function hydrate(tx: Tx, rows: PaymentRow[]): Promise<Payment[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const approvals = await tx<{ request_id: string; account_id: string; created_at: Date }[]>`
    SELECT request_id, account_id, created_at FROM approvals WHERE request_id IN ${tx(ids)} ORDER BY created_at`;
  const quotes = await tx<{ id: string; request_id: string; provider: string; confidentiality: string; amount_in: string; amount_out: string; min_amount_out: string; time_estimate_s: number | null; deadline: Date; quote_commitment: string; created_at: Date }[]>`
    SELECT DISTINCT ON (request_id) id, request_id, provider, confidentiality, amount_in, amount_out, min_amount_out, time_estimate_s, deadline, quote_commitment, created_at
    FROM quotes WHERE request_id IN ${tx(ids)} ORDER BY request_id, created_at DESC`;
  return rows.map((r) => {
    const q = quotes.find((x) => x.request_id === r.id);
    return {
      id: r.id,
      treasuryId: r.treasury_id,
      createdBy: { type: r.created_by_type, id: r.created_by_id, ...(r.agent_name ? { name: r.agent_name } : {}) },
      corridor: r.corridor,
      recipient: r.recipient,
      amount: r.amount,
      memo: r.memo,
      policyVersion: r.policy_version,
      policyDecision: r.policy_decision,
      commitment: r.commitment,
      status: r.status !== "settled" && r.status !== "policy_rejected" && r.status !== "cancelled" && r.expires_at < new Date() ? "expired" : r.status,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
      approvals: approvals.filter((a) => a.request_id === r.id).map((a) => ({ accountId: a.account_id, createdAt: a.created_at })),
      quote: q
        ? { id: q.id, provider: q.provider, confidentiality: q.confidentiality, amountIn: q.amount_in, amountOut: q.amount_out, minAmountOut: q.min_amount_out, timeEstimateSeconds: q.time_estimate_s, deadline: q.deadline, quoteCommitment: q.quote_commitment, createdAt: q.created_at }
        : null,
    };
  });
}

const selectPayments = (tx: Tx) => tx`
  SELECT p.id, p.treasury_id, p.created_by_type, p.created_by_id, a.name AS agent_name, p.corridor, p.recipient, p.amount::text AS amount,
         p.memo, p.policy_version, p.policy_decision, p.commitment, p.status, p.expires_at, p.created_at
  FROM payment_requests p LEFT JOIN agents a ON a.id = p.agent_id`;

function validate(input: CreatePaymentInput) {
  const recipient = normalizeEvmAddress(input.recipient ?? "");
  if (!recipient) throw badRequest("Recipient must be a Base address (0x followed by 40 hex characters).");
  let amount: bigint;
  try {
    amount = parseAmount(String(input.amount ?? ""));
  } catch (error) {
    throw badRequest((error as Error).message);
  }
  if (amount <= 0n) throw badRequest("Amount must be greater than zero.");
  const memo = String(input.memo ?? "").trim();
  if (memo.length > 140) throw badRequest("Memo must be 140 characters or fewer.");
  const idempotencyKey = String(input.idempotencyKey ?? "");
  if (!/^[A-Za-z0-9_.:-]{8,100}$/.test(idempotencyKey)) throw badRequest("Provide an Idempotency-Key header (8–100 characters).", "idempotency_key_required");
  return { recipient, amount, memo, idempotencyKey };
}

async function insertPayment(tx: Tx, treasury: Treasury, actor: Actor, agent: Agent | null, input: CreatePaymentInput): Promise<Payment> {
  const { recipient, amount, memo, idempotencyKey } = validate(input);

  const [existing] = await tx<PaymentRow[]>`${selectPayments(tx)} WHERE p.treasury_id = ${treasury.id} AND p.idempotency_key = ${idempotencyKey}`;
  if (existing) {
    const same = existing.recipient === recipient && BigInt(existing.amount) === amount && existing.created_by_id === actor.id;
    if (!same) throw conflict("This Idempotency-Key was already used for a different request.", "idempotency_conflict");
    return (await hydrate(tx, [existing]))[0];
  }

  let decision: PolicyDecision | null = null;
  if (agent) {
    // Serialize requests per agent so concurrent calls cannot both fit under the rolling cap.
    const [lock] = await tx<{ enabled: boolean }[]>`SELECT enabled FROM agents WHERE id = ${agent.id} FOR UPDATE`;
    const spent = await agentSpendInWindow(tx, agent.id, agent.policy.rollingCap.windowSeconds);
    decision = evaluatePolicy(agent.policy, { recipient, amount, spentInWindow: spent, enabled: lock.enabled });
  }

  const id = randomUUID();
  const status: PaymentStatus = decision && !decision.allowed ? "policy_rejected" : "awaiting_approval";
  const requestCommitment = commitment("payment-request", {
    id,
    treasuryId: treasury.id,
    corridor: USDC_NEAR_TO_BASE.id,
    recipient,
    amount,
    createdBy: actor,
    policyCommitment: decision?.policyCommitment ?? null,
  });
  const expiresAt = new Date(Date.now() + config.paymentTtlSeconds * 1000);
  await tx`
    INSERT INTO payment_requests (id, treasury_id, created_by_type, created_by_id, agent_id, corridor, recipient, amount, memo,
      policy_version, policy_decision, commitment, idempotency_key, status, expires_at)
    VALUES (${id}, ${treasury.id}, ${actor.type === "agent" ? "agent" : "human"}, ${actor.id}, ${agent?.id ?? null}, ${USDC_NEAR_TO_BASE.id},
      ${recipient}, ${amount.toString()}, ${memo}, ${decision?.policyVersion ?? null}, ${decision ? tx.json(decision as never) : null},
      ${requestCommitment}, ${idempotencyKey}, ${status}, ${expiresAt})`;
  await audit(tx, treasury.id, actor, status === "policy_rejected" ? "payment.policy_rejected" : "payment.requested", id, {
    commitment: requestCommitment,
    ...(decision ? { failedRules: decision.checks.filter((c) => !c.passed).map((c) => c.rule) } : {}),
  });
  const [row] = await tx<PaymentRow[]>`${selectPayments(tx)} WHERE p.id = ${id}`;
  return (await hydrate(tx, [row]))[0];
}

export async function createHumanPayment(session: Session, treasuryId: string, input: CreatePaymentInput): Promise<Payment> {
  return sql.begin(async (tx) => {
    const { treasury } = await treasuryForMember(tx, session.accountId, treasuryId);
    if (treasury.status !== "active") throw forbidden("This treasury is not accepting payment requests.");
    return insertPayment(tx, treasury, { type: "human", id: session.accountId }, null, input);
  });
}

export async function createAgentPayment(agent: Agent, input: CreatePaymentInput): Promise<Payment> {
  if (agent.mode !== "request_only") throw forbidden("Autonomous execution is not enabled for this release.");
  return sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; status: string; owner_account_id: string }[]>`SELECT id, status, owner_account_id FROM treasuries WHERE id = ${agent.treasuryId}`;
    const { treasury } = await treasuryForMember(tx, row.owner_account_id, row.id);
    if (treasury.status !== "active") throw forbidden("This treasury is not accepting payment requests.");
    return insertPayment(tx, treasury, { type: "agent", id: agent.id }, agent, input);
  });
}

export async function listPayments(session: Session, treasuryId: string): Promise<Payment[]> {
  await treasuryForMember(sql, session.accountId, treasuryId);
  const rows = await sql<PaymentRow[]>`${selectPayments(sql)} WHERE p.treasury_id = ${treasuryId} ORDER BY p.created_at DESC LIMIT 200`;
  return hydrate(sql, rows);
}

export async function listAgentPayments(agent: Agent): Promise<Payment[]> {
  const rows = await sql<PaymentRow[]>`${selectPayments(sql)} WHERE p.agent_id = ${agent.id} ORDER BY p.created_at DESC LIMIT 50`;
  return hydrate(sql, rows);
}

async function paymentForMember(tx: Tx, session: Session, paymentId: string, lock = false) {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw notFound("Payment request not found.");
  const [row] = lock
    ? await tx<PaymentRow[]>`${selectPayments(tx)} WHERE p.id = ${paymentId} FOR UPDATE OF p`
    : await tx<PaymentRow[]>`${selectPayments(tx)} WHERE p.id = ${paymentId}`;
  if (!row) throw notFound("Payment request not found.");
  const { treasury, role } = await treasuryForMember(tx, session.accountId, row.treasury_id).catch(() => {
    throw notFound("Payment request not found.");
  });
  const [payment] = await hydrate(tx, [row]);
  return { payment, treasury, role };
}

export async function getPayment(session: Session, paymentId: string): Promise<Payment> {
  return (await paymentForMember(sql, session, paymentId)).payment;
}

function approvalSubject(payment: Payment) {
  return `${payment.id}:${payment.commitment}`;
}

// The wallet signs a message stating the material effect of the approval: amount, recipient, chain,
// and the request commitment. The signature is bound to this session and this exact request.
export async function createApprovalChallenge(session: Session, paymentId: string) {
  return sql.begin(async (tx) => {
    const { payment, treasury } = await paymentForMember(tx, session, paymentId);
    if (payment.status !== "awaiting_approval") throw conflict(`This request is ${payment.status.replace("_", " ")} and cannot be approved.`);
    if (payment.approvals.some((a) => a.accountId === session.accountId)) throw conflict("You already approved this request.");
    return issueChallenge(tx, {
      purpose: "approve_payment",
      subject: approvalSubject(payment),
      sessionId: session.id,
      lines: [
        "Approve a Scrim payment",
        "",
        `Treasury: ${treasury.name}`,
        `Pay: ${formatUsdc(payment.amount)} on Base`,
        `To: ${payment.recipient}`,
        `Request: ${payment.id}`,
        `Commitment: ${payment.commitment}`,
      ],
    });
  });
}

export async function approvePayment(session: Session, paymentId: string, envelope: SignedEnvelope): Promise<Payment> {
  return sql.begin(async (tx) => {
    const { payment, treasury } = await paymentForMember(tx, session, paymentId, true);
    if (payment.status !== "awaiting_approval") throw conflict(`This request is ${payment.status.replace("_", " ")} and cannot be approved.`);
    if (envelope.accountId !== session.accountId) throw forbidden("Approve with the account you signed in with.");
    const signed = await consumeSignedChallenge(tx, envelope, { purpose: "approve_payment", subject: approvalSubject(payment), sessionId: session.id });
    const inserted = await tx`
      INSERT INTO approvals (request_id, account_id, public_key, signature, challenge_id)
      VALUES (${payment.id}, ${signed.accountId}, ${signed.publicKey}, ${envelope.signature}, ${signed.challengeId})
      ON CONFLICT DO NOTHING RETURNING request_id`;
    if (inserted.length === 0) throw conflict("You already approved this request.");
    const count = payment.approvals.length + 1;
    const reached = count >= treasury.thresholdRequired;
    if (reached) await tx`UPDATE payment_requests SET status = 'approved', updated_at = now() WHERE id = ${payment.id}`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, "payment.approved", payment.id, {
      approvals: count,
      threshold: treasury.thresholdRequired,
      thresholdReached: reached,
    });
    return (await paymentForMember(tx, session, paymentId)).payment;
  });
}

export async function cancelPayment(session: Session, paymentId: string): Promise<Payment> {
  return sql.begin(async (tx) => {
    const { payment, treasury } = await paymentForMember(tx, session, paymentId, true);
    if (!["awaiting_approval", "approved", "quoted"].includes(payment.status)) throw conflict("This request can no longer be cancelled.");
    await tx`UPDATE payment_requests SET status = 'cancelled', updated_at = now() WHERE id = ${payment.id}`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, "payment.cancelled", payment.id);
    return (await paymentForMember(tx, session, paymentId)).payment;
  });
}

export async function requestQuote(session: Session, paymentId: string): Promise<Payment> {
  const { payment, treasury } = await paymentForMember(sql, session, paymentId);
  if (!["approved", "quoted"].includes(payment.status)) throw conflict("A request needs its approvals before a settlement quote.");
  const quote = await quoteProvider()({
    requestId: payment.id,
    amount: BigInt(payment.amount),
    recipient: payment.recipient,
    refundTo: refundAccountFor(treasury.ownerAccountId, treasury.network),
  });
  return sql.begin(async (tx) => {
    const updated = await tx`
      UPDATE payment_requests SET status = 'quoted', updated_at = now()
      WHERE id = ${payment.id} AND status IN ('approved', 'quoted') RETURNING id`;
    if (updated.length === 0) throw conflict("This request changed while the quote was requested.");
    await tx`
      INSERT INTO quotes (id, request_id, provider, confidentiality, amount_in, amount_out, min_amount_out, time_estimate_s, deadline, quote_commitment, raw)
      VALUES (${randomUUID()}, ${payment.id}, ${quote.provider}, ${quote.confidentiality}, ${quote.amountIn.toString()}, ${quote.amountOut.toString()},
        ${quote.minAmountOut.toString()}, ${quote.timeEstimateSeconds}, ${quote.deadline}, ${quote.quoteCommitment}, ${tx.json(quote.raw as never)})`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, "payment.quoted", payment.id, {
      provider: quote.provider,
      confidentiality: quote.confidentiality,
      quoteCommitment: quote.quoteCommitment,
    });
    return (await paymentForMember(tx, session, paymentId)).payment;
  });
}

export async function listAudit(session: Session, treasuryId: string) {
  await treasuryForMember(sql, session.accountId, treasuryId);
  return sql<{ id: string; actor_type: string; actor_id: string; action: string; subject_id: string | null; data: Record<string, unknown>; created_at: Date }[]>`
    SELECT id::text, actor_type, actor_id, action, subject_id, data, created_at FROM audit_events
    WHERE treasury_id = ${treasuryId} ORDER BY id DESC LIMIT 100`;
}


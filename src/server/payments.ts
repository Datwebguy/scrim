import { randomUUID } from "node:crypto";
import { formatAmount, parseAmount } from "@/protocol/amount";
import { commitment } from "@/protocol/canonical";
import { corridorFor, type Corridor } from "@/protocol/corridor";
import { normalizeEvmAddress, normalizeNearAccount, normalizeOrigin } from "@/protocol/identifiers";
import type { Network } from "@/protocol/networks";
import { evaluatePolicy, type PolicyDecision } from "@/protocol/policy";
import { agentSpendInWindow, type Agent } from "./agents";
import { audit, type Actor } from "./audit";
import { consumeSignedChallenge, issueChallenge, type Session, type SignedEnvelope } from "./auth";
import { config } from "./config";
import { sql, type Tx } from "./db";
import { badRequest, conflict, forbidden, notFound } from "./errors";
import { finalTransaction } from "./near-rpc";
import { emitPaymentEvent } from "./notify";
import { treasuryForMember, type Treasury } from "./treasuries";

type PaymentStatus = "policy_rejected" | "awaiting_approval" | "approved" | "quoted" | "submitting" | "settled" | "failed" | "expired" | "cancelled";

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
};

export type CreatePaymentInput = { recipient: string; amount: string; memo?: string; idempotencyKey: string; x402?: boolean };

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
  return rows.map((r) => {
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
    };
  });
}

const selectPayments = (tx: Tx) => tx`
  SELECT p.id, p.treasury_id, p.created_by_type, p.created_by_id, a.name AS agent_name, p.corridor, p.recipient, p.amount::text AS amount,
         p.memo, p.policy_version, p.policy_decision, p.commitment, p.status, p.expires_at, p.created_at
  FROM payment_requests p LEFT JOIN agents a ON a.id = p.agent_id`;

function validate(input: CreatePaymentInput, corridor: Corridor) {
  // x402 purchases name the seller by its web address; everything else pays an address on the team's network.
  const recipient = input.x402 ? normalizeOrigin(input.recipient ?? "") : corridor.recipient === "evm" ? normalizeEvmAddress(input.recipient ?? "") : normalizeNearAccount(input.recipient ?? "");
  if (!recipient) throw badRequest(corridor.recipient === "evm" ? "Recipient must be a Base address (0x followed by 40 hex characters)." : "Recipient must be a NEAR testnet account, like name.testnet.");
  let amount: bigint;
  try {
    amount = parseAmount(String(input.amount ?? ""), corridor.decimals);
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
  const corridor = corridorFor(treasury.network);
  const { recipient, amount, memo, idempotencyKey } = validate(input, corridor);

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
    decision = evaluatePolicy(agent.policy, { recipient, amount, unit: corridor, spentInWindow: spent, enabled: lock.enabled });
  }

  const id = randomUUID();
  const status: PaymentStatus = decision && !decision.allowed ? "policy_rejected" : "awaiting_approval";
  const requestCommitment = commitment("payment-request", {
    id,
    treasuryId: treasury.id,
    corridor: corridor.id,
    recipient,
    amount,
    createdBy: actor,
    policyCommitment: decision?.policyCommitment ?? null,
  });
  const expiresAt = new Date(Date.now() + config.paymentTtlSeconds * 1000);
  await tx`
    INSERT INTO payment_requests (id, treasury_id, created_by_type, created_by_id, agent_id, corridor, recipient, amount, memo,
      policy_version, policy_decision, commitment, idempotency_key, status, expires_at)
    VALUES (${id}, ${treasury.id}, ${actor.type === "agent" ? "agent" : "human"}, ${actor.id}, ${agent?.id ?? null}, ${corridor.id},
      ${recipient}, ${amount.toString()}, ${memo}, ${decision?.policyVersion ?? null}, ${decision ? tx.json(decision as never) : null},
      ${requestCommitment}, ${idempotencyKey}, ${status}, ${expiresAt})`;
  await audit(tx, treasury.id, actor, status === "policy_rejected" ? "payment.policy_rejected" : "payment.requested", id, {
    commitment: requestCommitment,
    ...(decision ? { failedRules: decision.checks.filter((c) => !c.passed).map((c) => c.rule) } : {}),
  });
  const [row] = await tx<PaymentRow[]>`${selectPayments(tx)} WHERE p.id = ${id}`;
  return { ...(await hydrate(tx, [row]))[0], fresh: true } as Payment;
}

export async function createHumanPayment(session: Session, treasuryId: string, input: CreatePaymentInput): Promise<Payment> {
  return announceNew(await sql.begin(async (tx) => {
    const { treasury } = await treasuryForMember(tx, session.accountId, treasuryId, session.network);
    if (treasury.status !== "active") throw forbidden("This treasury is not accepting payment requests.");
    return insertPayment(tx, treasury, { type: "human", id: session.accountId }, null, input);
  }));
}

export async function createAgentPayment(agent: Agent, input: CreatePaymentInput): Promise<Payment> {
  if (agent.mode !== "request_only") throw forbidden("Autonomous execution is not enabled for this release.");
  return announceNew(await sql.begin(async (tx) => {
    const [row] = await tx<{ id: string; status: string; owner_account_id: string }[]>`SELECT id, status, owner_account_id FROM treasuries WHERE id = ${agent.treasuryId}`;
    const { treasury } = await treasuryForMember(tx, row.owner_account_id, row.id);
    if (treasury.status !== "active") throw forbidden("This treasury is not accepting payment requests.");
    return insertPayment(tx, treasury, { type: "agent", id: agent.id }, agent, input);
  }));
}

// Only a newly created request is announced; a repeat with the same Idempotency-Key is not.
function announceNew(payment: Payment & { fresh?: boolean }): Payment {
  if (payment.fresh) emitPaymentEvent(payment.id, payment.status === "policy_rejected" ? "payment.policy_rejected" : "payment.requested");
  delete payment.fresh;
  return payment;
}

export async function listPayments(session: Session, treasuryId: string): Promise<Payment[]> {
  await treasuryForMember(sql, session.accountId, treasuryId, session.network);
  const rows = await sql<PaymentRow[]>`${selectPayments(sql)} WHERE p.treasury_id = ${treasuryId} ORDER BY p.created_at DESC LIMIT 200`;
  return hydrate(sql, rows);
}

export async function getAgentPayment(agent: Agent, paymentId: string): Promise<Payment> {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw notFound("Payment request not found.");
  const [row] = await sql<PaymentRow[]>`${selectPayments(sql)} WHERE p.id = ${paymentId} AND p.agent_id = ${agent.id}`;
  if (!row) throw notFound("Payment request not found.");
  return (await hydrate(sql, [row]))[0];
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
  const { treasury, role } = await treasuryForMember(tx, session.accountId, row.treasury_id, session.network).catch(() => {
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
      network: session.network,
      subject: approvalSubject(payment),
      sessionId: session.id,
      lines: [
        "Approve a Scrim payment",
        "",
        `Treasury: ${treasury.name}`,
        `Pay: ${formatAmount(BigInt(payment.amount), corridorFor(treasury.network).decimals)} ${corridorFor(treasury.network).symbol} (${corridorFor(treasury.network).routeLabel})`,
        `To: ${payment.recipient}`,
        `Request: ${payment.id}`,
        `Commitment: ${payment.commitment}`,
      ],
    });
  });
}

export async function approvePayment(session: Session, paymentId: string, envelope: SignedEnvelope): Promise<Payment> {
  const payment = await sql.begin(async (tx) => {
    const { payment, treasury } = await paymentForMember(tx, session, paymentId, true);
    if (payment.status !== "awaiting_approval") throw conflict(`This request is ${payment.status.replace("_", " ")} and cannot be approved.`);
    if (envelope.accountId !== session.accountId) throw forbidden("Approve with the account you signed in with.");
    const signed = await consumeSignedChallenge(tx, envelope, { purpose: "approve_payment", subject: approvalSubject(payment), sessionId: session.id, network: session.network });
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
  if (payment.status === "approved") emitPaymentEvent(payment.id, "payment.approved");
  return payment;
}

export async function cancelPayment(session: Session, paymentId: string): Promise<Payment> {
  const cancelled = await sql.begin(async (tx) => {
    const { payment, treasury } = await paymentForMember(tx, session, paymentId, true);
    if (!["awaiting_approval", "approved", "quoted"].includes(payment.status)) throw conflict("This request can no longer be cancelled.");
    await tx`UPDATE payment_requests SET status = 'cancelled', updated_at = now() WHERE id = ${payment.id}`;
    await audit(tx, treasury.id, { type: "human", id: session.accountId }, "payment.cancelled", payment.id);
    return (await paymentForMember(tx, session, paymentId)).payment;
  });
  emitPaymentEvent(cancelled.id, "payment.cancelled");
  return cancelled;
}

// Moves a team request along as its payout progresses, only from the states it is allowed to leave,
// so a cancelled or already-paid request can never be changed by a late transfer update.
export async function markTeamRequest(tx: Tx, requestId: string, status: "submitting" | "settled" | "failed" | "approved", actor: Actor, from: string[]): Promise<boolean> {
  const [row] = await tx<{ treasury_id: string }[]>`
    UPDATE payment_requests SET status = ${status}, updated_at = now() WHERE id = ${requestId} AND status IN ${tx(from)} RETURNING treasury_id`;
  if (row) await audit(tx, row.treasury_id, actor, `payment.${status}`, requestId);
  return Boolean(row);
}

export async function approvedTeamRequest(session: Session, requestId: string) {
  const { payment, treasury } = await paymentForMember(sql, session, requestId);
  if (payment.status !== "approved") throw conflict("This request is not approved yet, or it was already paid.");
  if (treasury.ownerAccountId !== session.accountId) throw forbidden("Only the treasury owner can pay approved requests from their balance.");
  return payment;
}

export async function listAudit(session: Session, treasuryId: string) {
  await treasuryForMember(sql, session.accountId, treasuryId, session.network);
  return sql<{ id: string; actor_type: string; actor_id: string; action: string; subject_id: string | null; data: Record<string, unknown>; created_at: Date }[]>`
    SELECT id::text, actor_type, actor_id, action, subject_id, data, created_at FROM audit_events
    WHERE treasury_id = ${treasuryId} ORDER BY id DESC LIMIT 100`;
}


// Testnet payout. The owner's wallet sent real test NEAR straight to the recipient. Before marking the
// request paid, read the transaction back from the chain and check who sent it, to whom, and how much.
export async function recordTestnetPayout(session: Session, requestId: string, txHash: string): Promise<Payment> {
  if (session.network !== "testnet") throw badRequest("This is only for testnet. On mainnet, pay from your private balance.");
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(txHash)) throw badRequest("That doesn't look like a transaction hash.");
  const payment = await approvedTeamRequest(session, requestId);
  const [seen] = await sql`SELECT 1 FROM payment_requests WHERE settled_tx_hash = ${txHash}`;
  if (seen) throw conflict("That transaction was already used to pay a request.");
  const outcome = await finalTransaction("testnet", txHash, session.accountId);
  if (!outcome) throw conflict("We can't find that transaction yet. Wait a few seconds and try again.");
  const { transaction, status } = outcome;
  if (status.Failure) throw conflict("That transaction failed on the network, so nothing was paid.");
  if (transaction.signer_id !== session.accountId) throw forbidden("That transaction was not sent from your account.");
  if (transaction.receiver_id !== payment.recipient) throw badRequest("That transaction paid a different account than this request.");
  const sent = transaction.actions.reduce((total, action) => total + BigInt(action.Transfer?.deposit ?? "0"), 0n);
  if (sent !== BigInt(payment.amount)) throw badRequest("That transaction sent a different amount than this request.");
  try {
    await sql.begin(async (tx) => {
      // The unique index on settled_tx_hash means one transaction can pay only one request, even if two arrive at once.
      const done = await tx`UPDATE payment_requests SET status = 'settled', settled_tx_hash = ${txHash}, updated_at = now() WHERE id = ${payment.id} AND status = 'approved' RETURNING treasury_id`;
      if (done.length !== 1) throw conflict("This request was already paid.");
      await audit(tx, payment.treasuryId, { type: "human", id: session.accountId }, "payment.settled", payment.id, { txHash, network: "testnet" });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") throw conflict("That transaction was already used to pay a request.");
    throw error;
  }
  emitPaymentEvent(payment.id, "payment.settled");
  return (await paymentForMember(sql, session, requestId)).payment;
}

"use client";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/client/api";
import { relativeTime, short, STATUS_LABEL } from "@/client/format";
import { sendNear, signChallenge, signTransfer } from "@/client/wallet";
import { formatAmount } from "@/protocol/amount";
import { describeWindow } from "@/protocol/policy";
import type { Agent } from "@/server/agents";
import type { Payment } from "@/server/payments";
import type { Treasury, TreasuryRole } from "@/server/treasuries";
import { useSession } from "./session";
import { TelegramAlerts } from "./TelegramAlerts";
import { Initials, Modal, newIdempotencyKey, Spinner, StatusPill, useToast } from "./ui";

type AuditEvent = { id: string; actor_type: string; actor_id: string; action: string; subject_id: string | null; data: Record<string, unknown>; created_at: string };
type Data = { treasury: Treasury; role: TreasuryRole; agents: Agent[]; payments: Payment[]; audit: AuditEvent[] };
type Tab = "requests" | "agents" | "signers" | "audit";

type Unit = Treasury["unit"];
const amountIn = (minor: string | bigint, unit: Unit) => formatAmount(BigInt(minor), unit.decimals);
const COUNTED = new Set(["awaiting_approval", "approved", "quoted", "submitting", "settled"]);

export function TreasuryView({ treasuryId, accountId }: { treasuryId: string; accountId: string }) {
  const router = useRouter();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("requests");
  const [selected, setSelected] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [agentDialog, setAgentDialog] = useState<{ mode: "create" } | { mode: "edit"; agent: Agent } | null>(null);
  const [revealedKey, setRevealedKey] = useState<{ name: string; key: string; renewed?: boolean } | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Data>(`/treasuries/${treasuryId}`));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load this team account.");
    }
  }, [treasuryId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15_000);
    return () => clearInterval(timer);
  }, [load]);

  const refresh = useCallback(async () => {
    await load();
    router.refresh();
  }, [load, router]);

  if (error && !data) return <div className="notice danger">{error}</div>;
  if (!data) return <div className="skeleton" aria-label="Loading" />;

  const { treasury, role, agents, payments, audit } = data;
  const needsMe = payments.filter((p) => p.status === "awaiting_approval" && !p.approvals.some((a) => a.accountId === accountId));
  const blocked24h = payments.filter((p) => p.status === "policy_rejected" && Date.now() - new Date(p.createdAt).getTime() < 86_400_000);
  const committed = payments.filter((p) => COUNTED.has(p.status) && Date.now() - new Date(p.createdAt).getTime() < 86_400_000).reduce((sum, p) => sum + BigInt(p.amount), 0n);
  const selectedPayment = payments.find((p) => p.id === selected) ?? null;

  return (
    <>
      <div className="page-head">
        <div>
          <span className="eyebrow">{treasury.kind === "team" ? "Team account" : "Personal account"}</span>
          <h1>{treasury.name}</h1>
          <div className="meta">
            <span className="pill pill-dark plain">
              {treasury.thresholdRequired} of {treasury.signers.length} approvals
            </span>
            <span className="pill plain">{treasury.unit.routeLabel}</span>
            <span className="pill plain">Pays out privately</span>
            <span className="pill plain">{role === "owner" ? "You own this account" : "You are an approver"}</span>
          </div>
        </div>
        <div className="actions">
          {role === "owner" && (
            <button className="btn btn-ghost" onClick={() => setAgentDialog({ mode: "create" })}>
              + Add agent
            </button>
          )}
          <button className="btn btn-primary" onClick={() => setPaying(true)}>
            New payment <span className="arrow">→</span>
          </button>
        </div>
      </div>

      <div className="stats">
        <div className={`card stat ${needsMe.length ? "attention" : ""}`}>
          <span>Needs your approval</span>
          <strong>{needsMe.length}</strong>
          <p>{needsMe.length ? "Review and approve in your wallet" : "You're all caught up"}</p>
        </div>
        <div className="card stat">
          <span>Committed · 24h</span>
          <strong>
            {amountIn(committed, treasury.unit)}
            <small>{treasury.unit.symbol}</small>
          </strong>
          <p>Requested or approved, not blocked</p>
        </div>
        <div className="card stat">
          <span>Agents</span>
          <strong>
            {agents.filter((a) => a.enabled).length}
            <small>/ {agents.length} active</small>
          </strong>
          <p>Can ask, never approve</p>
        </div>
        <div className="card stat">
          <span>Blocked by limits · 24h</span>
          <strong>{blocked24h.length}</strong>
          <p>Stopped before reaching anyone</p>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {(
          [
            ["requests", "Payments", payments.length],
            ["agents", "Agents", agents.length],
            ["signers", "People", treasury.signers.length],
            ["audit", "History", audit.length],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} role="tab" className="tab" aria-selected={tab === id} onClick={() => setTab(id)}>
            {label}
            <span className="n">{n}</span>
          </button>
        ))}
      </div>

      <TelegramAlerts />

      {tab === "requests" && <Requests payments={payments} treasury={treasury} onOpen={setSelected} onNew={() => setPaying(true)} />}
      {tab === "agents" && (
        <Agents
          agents={agents}
          payments={payments}
          role={role}
          unit={treasury.unit}
          onCreate={() => setAgentDialog({ mode: "create" })}
          onEdit={(agent) => setAgentDialog({ mode: "edit", agent })}
          onConnect={(agent) => setConnecting(agent.id)}
          onToggle={async (agent) => {
            try {
              await api(`/agents/${agent.id}`, { method: "PATCH", body: { enabled: !agent.enabled } });
              toast(agent.enabled ? `${agent.name} paused` : `${agent.name} resumed`);
              refresh();
            } catch (e) {
              toast((e as Error).message, "error");
            }
          }}
        />
      )}
      {tab === "signers" && <Signers treasury={treasury} accountId={accountId} />}
      {tab === "audit" && <Audit events={audit} agents={agents} />}

      {selectedPayment && (
        <PaymentDrawer payment={selectedPayment} treasury={treasury} accountId={accountId} onClose={() => setSelected(null)} onChanged={refresh} />
      )}
      <NewPaymentDialog
        open={paying}
        treasuryId={treasury.id}
        unit={treasury.unit}
        onClose={() => setPaying(false)}
        onCreated={(payment) => {
          setPaying(false);
          refresh();
          setTab("requests");
          setSelected(payment.id);
        }}
      />
      <AgentDialog
        state={agentDialog}
        treasuryId={treasury.id}
        unit={treasury.unit}
        onClose={() => setAgentDialog(null)}
        onSaved={(result) => {
          setAgentDialog(null);
          if (result.apiKey) setRevealedKey({ name: result.agent.name, key: result.apiKey });
          else toast(`Limits updated to v${result.agent.policy.version}`);
          setTab("agents");
          refresh();
        }}
      />
      <KeyReveal state={revealedKey} onClose={() => setRevealedKey(null)} />
      <ConnectDialog
        agent={agents.find((a) => a.id === connecting) ?? null}
        role={role}
        onClose={() => setConnecting(null)}
        onNewKey={(agent, key) => {
          setConnecting(null);
          setRevealedKey({ name: agent.name, key, renewed: true });
          refresh();
        }}
        onChanged={refresh}
      />
    </>
  );
}

function Origin({ payment }: { payment: Payment }) {
  if (payment.createdBy.type === "agent") {
    const name = payment.createdBy.name ?? "Agent";
    return (
      <span className="origin">
        <Initials name={name} className="agent-dot" />
        {name}
      </span>
    );
  }
  return (
    <span className="origin">
      <Initials name={payment.createdBy.id} className="human" />
      {payment.createdBy.id}
    </span>
  );
}

function Approvals({ have, need }: { have: number; need: number }) {
  return (
    <span className="progress-dots" aria-label={`${have} of ${need} approvals`}>
      {Array.from({ length: need }, (_, i) => (
        <i key={i} className={i < have ? "on" : ""} />
      ))}
      <span>
        {Math.min(have, need)}/{need}
      </span>
    </span>
  );
}

function Requests({ payments, treasury, onOpen, onNew }: { payments: Payment[]; treasury: Treasury; onOpen: (id: string) => void; onNew: () => void }) {
  if (payments.length === 0) {
    return (
      <div className="card empty">
        <span className="icon">↗</span>
        <h3>No payment requests yet</h3>
        <p>Create a request yourself, or give an agent spending limits and let it ask. Every request is checked and waits for {treasury.thresholdRequired === 1 ? "your" : "your signers'"} approval.</p>
        <button className="btn btn-primary" onClick={onNew}>
          New payment
        </button>
      </div>
    );
  }
  return (
    <div className="card table-card">
      <table className="table">
        <thead>
          <tr>
            <th>Amount</th>
            <th className="hide-sm">Recipient</th>
            <th className="hide-sm">Requested by</th>
            <th className="hide-sm">Approvals</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} onClick={() => onOpen(p.id)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(p.id)}>
              <td>
                <span className="amt">
                  {amountIn(p.amount, treasury.unit)}
                  <small>{treasury.unit.symbol}</small>
                </span>
                <span className="sub">
                  {relativeTime(p.createdAt)}
                  <span className="show-sm"> · {short(p.recipient)}</span>
                </span>
              </td>
              <td className="hide-sm">
                <span className="mono" style={{ fontSize: 13 }}>
                  {short(p.recipient)}
                </span>
                <span className="sub">{p.memo || treasury.unit.routeLabel}</span>
              </td>
              <td className="hide-sm">
                <Origin payment={p} />
              </td>
              <td className="hide-sm">{p.status === "policy_rejected" ? <span className="muted">—</span> : <Approvals have={p.approvals.length} need={treasury.thresholdRequired} />}</td>
              <td>
                <StatusPill status={p.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentDrawer({ payment, treasury, accountId, onClose, onChanged }: { payment: Payment; treasury: Treasury; accountId: string; onClose: () => void; onChanged: () => void }) {
  const { network } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState<"" | "approve" | "cancel" | "pay">("");
  const [error, setError] = useState("");
  const approvedByMe = payment.approvals.some((a) => a.accountId === accountId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(kind: "approve" | "cancel" | "pay") {
    setBusy(kind);
    setError("");
    try {
      if (kind === "approve") {
        const challenge = await api<{ challengeId: string; message: string; nonce: string; recipient: string }>(`/payments/${payment.id}/approval-challenge`, { method: "POST" });
        const signed = await signChallenge(network, challenge, accountId);
        await api(`/payments/${payment.id}/approve`, { body: signed });
        toast("Approval signed");
      } else if (kind === "pay" && network === "testnet") {
        // Remember the transfer once the wallet has sent it. If confirming fails, trying again only
        // confirms it; it never sends the money a second time.
        const saved = `scrim:payout:${payment.id}`;
        let txHash = "";
        try { txHash = sessionStorage.getItem(saved) ?? ""; } catch { /* optional */ }
        if (!txHash) {
          txHash = await sendNear(network, payment.recipient, payment.amount);
          if (!txHash) throw new Error("Your wallet sent the payment but didn't share its receipt. Check your wallet's history before trying again.");
          try { sessionStorage.setItem(saved, txHash); } catch { /* optional */ }
        }
        try {
          await api(`/payments/${payment.id}/payout`, { body: { txHash } });
        } catch (e) {
          throw new Error(`${(e as Error).message} Your payment was already sent. Tap Pay again to confirm it; it won't be sent twice.`);
        }
        try { sessionStorage.removeItem(saved); } catch { /* optional */ }
        toast("Paid. The transfer is confirmed on testnet.");
      } else if (kind === "pay") {
        const { transfer } = await api<{ transfer: { id: string; intentToSign: { message: string; nonce: string; recipient: string } } }>(`/payments/${payment.id}/pay`, { method: "POST" });
        const signed = await signTransfer(network, transfer.intentToSign, accountId);
        await api(`/transfers/${transfer.id}/sign`, { body: signed });
        toast("Payment sent");
      } else {
        await api(`/payments/${payment.id}/cancel`, { method: "POST" });
        toast("Request cancelled");
      }
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy("");
    }
  }


  return (
    <>
      <div className="scrim" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Payment request">
        <div className="drawer-head">
          <StatusPill status={payment.status} />
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="drawer-body">
          <div>
            <span className="section-label">Pay · {treasury.unit.routeLabel}</span>
            <div className="big-amount">
              {amountIn(payment.amount, treasury.unit)}
              <small>{treasury.unit.symbol}</small>
            </div>
            <p className="muted" style={{ marginTop: 8, fontSize: 14 }}>
              {payment.memo || "No memo"} · requested {relativeTime(payment.createdAt)}
            </p>
          </div>

          <dl className="detail-list">
            <div>
              <dt>Recipient</dt>
              <dd className="mono">{payment.recipient}</dd>
            </div>
            <div>
              <dt>Route</dt>
              <dd>{treasury.network === "mainnet" ? "Private balance → USDC on Base" : "Your wallet → the recipient, on testnet"}</dd>
            </div>
            <div>
              <dt>Requested by</dt>
              <dd>
                <Origin payment={payment} />
              </dd>
            </div>
            <div>
              <dt>Reference</dt>
              <dd className="mono" title={payment.commitment}>
                {short(payment.commitment, 16, 8)}
              </dd>
            </div>
          </dl>

          {payment.policyDecision && (
            <div>
              <span className="section-label">
                Spending limit check · version {payment.policyDecision.policyVersion}
              </span>
              <div className="checks" style={{ margin: 0 }}>
                {payment.policyDecision.checks.map((c) => (
                  <div key={c.rule} className={`check ${c.passed ? "" : "fail"}`}>
                    <span className="mark">{c.passed ? "✓" : "×"}</span>
                    <b style={{ fontWeight: 600 }}>{c.detail}</b>
                    <small>{c.rule.replace(/_/g, " ")}</small>
                  </div>
                ))}
              </div>
            </div>
          )}

          {payment.status !== "policy_rejected" && (
            <div>
              <span className="section-label">
                Approvals · {Math.min(payment.approvals.length, treasury.thresholdRequired)} of {treasury.thresholdRequired} required
              </span>
              <div className="card signer-list">
                {treasury.signers.map((s) => {
                  const approval = payment.approvals.find((a) => a.accountId === s.accountId);
                  return (
                    <div key={s.accountId} className="signer-row">
                      <span className="who">
                        <Initials name={s.accountId} className={`avatar ${approval ? "ok" : ""}`} />
                        <span style={{ fontSize: 14 }}>
                          {s.accountId}
                          {s.accountId === accountId && <span className="muted"> (you)</span>}
                        </span>
                      </span>
                      {approval ? <span className="pill pill-green">Signed {relativeTime(approval.createdAt)}</span> : <span className="pill plain">Pending</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {payment.status === "approved" && (
            <div className="notice info">{network === "testnet" ? "Approved. The account owner can now pay this from their wallet. It sends real test NEAR." : "Approved. The account owner can now pay this from their private balance."}</div>
          )}
          {payment.status === "submitting" && <div className="notice info">On its way to the recipient.</div>}
          {payment.status === "settled" && <div className="notice good">Paid. The money has arrived.</div>}
          {payment.status === "policy_rejected" && <div className="notice danger">The spending limits blocked this request before it reached anyone to approve. Change the limits or make a new request.</div>}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="drawer-foot">
          {payment.status === "awaiting_approval" && !approvedByMe && (
            <button className="btn btn-primary" onClick={() => run("approve")} disabled={!!busy}>
              {busy === "approve" && <Spinner />} Approve with wallet
            </button>
          )}
          {payment.status === "awaiting_approval" && approvedByMe && (
            <button className="btn btn-ghost" disabled>
              You signed · waiting for others
            </button>
          )}
          {payment.status === "approved" && treasury.ownerAccountId === accountId && (
            <button className="btn btn-signal" onClick={() => run("pay")} disabled={!!busy}>
              {busy === "pay" && <Spinner />} {network === "testnet" ? "Pay with my wallet" : "Pay from my private balance"}
            </button>
          )}
          {["awaiting_approval", "approved"].includes(payment.status) && (
            <button className="btn btn-danger" onClick={() => run("cancel")} disabled={!!busy} style={{ flex: "0 0 auto" }}>
              Cancel
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function NewPaymentDialog({ open, treasuryId, unit, onClose, onCreated }: { open: boolean; treasuryId: string; unit: Unit; onClose: () => void; onCreated: (p: Payment) => void }) {
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [key, setKey] = useState("");

  useEffect(() => {
    if (open) {
      setKey(newIdempotencyKey("web"));
      setError("");
    }
  }, [open]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { payment } = await api<{ payment: Payment }>(`/treasuries/${treasuryId}/payments`, { body: { recipient, amount, memo }, idempotencyKey: key });
      setRecipient("");
      setAmount("");
      setMemo("");
      onCreated(payment);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} eyebrow="New payment" title="Request a payment">
      <form id="new-payment" className="form-grid" onSubmit={submit}>
        <label className="field">
          Recipient<small>{unit.recipientLabel.replace(/^a /, "A ")}</small>
          <input className="input mono" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder={unit.symbol === "NEAR" ? "account.testnet" : "0x… or https://api.seller.com"} spellCheck={false} autoComplete="off" required />
        </label>
        <div className="form-row">
          <label className="field">
            Amount they receive
            <span className="input-affix">
              <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" required />
              <span>{unit.symbol}</span>
            </span>
          </label>
          <label className="field">
            What it's for <small>Optional</small>
            <input className="input" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={140} />
          </label>
        </div>
        <div className="notice info">It needs the approvals you set before it can be paid.</div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-foot" style={{ padding: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />} Create request
          </button>
        </div>
      </form>
    </Modal>
  );
}

function agentUsage(agent: Agent, payments: Payment[]) {
  const windowMs = agent.policy.rollingCap.windowSeconds * 1000;
  return payments
    .filter((p) => p.createdBy.type === "agent" && p.createdBy.id === agent.id && COUNTED.has(p.status) && Date.now() - new Date(p.createdAt).getTime() < windowMs)
    .reduce((sum, p) => sum + BigInt(p.amount), 0n);
}

function Agents({ agents, payments, role, unit, onCreate, onEdit, onToggle, onConnect }: { agents: Agent[]; payments: Payment[]; role: TreasuryRole; unit: Unit; onCreate: () => void; onEdit: (a: Agent) => void; onToggle: (a: Agent) => void; onConnect: (a: Agent) => void }) {
  if (agents.length === 0) {
    return (
      <div className="card empty">
        <span className="icon">⌁</span>
        <h3>No agents yet</h3>
        <p>An agent is software that pays on your behalf. It gets its own key and spending limits: who it may pay, how much each time, and how much per day. It can ask to pay. It can never approve.</p>
        {role === "owner" && (
          <button className="btn btn-primary" onClick={onCreate}>
            Add your first agent
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="agents-grid">
      {agents.map((agent) => {
        const used = agentUsage(agent, payments);
        const cap = BigInt(agent.policy.rollingCap.amount);
        const pct = cap > 0n ? Number((used * 1000n) / cap) / 10 : 0;
        const requests = payments.filter((p) => p.createdBy.type === "agent" && p.createdBy.id === agent.id);
        const blocked = requests.filter((p) => p.status === "policy_rejected").length;
        return (
          <article key={agent.id} className="card agent-card">
            <header>
              <div className="who">
                <Initials name={agent.name} className="agent-dot" />
                <div>
                  <h3>{agent.name}</h3>
                  <small>
                    Limits v{agent.policy.version}
                  </small>
                </div>
              </div>
              <span className={`pill ${agent.enabled ? "pill-green" : ""}`}>{agent.enabled ? "Active" : "Paused"}</span>
            </header>
            <div className="meter">
              <span>
                <span>
                  {describeWindow(agent.policy.rollingCap.windowSeconds)} budget
                </span>
                <span>
                  <b>{amountIn(used, unit)}</b>{" "}/ {amountIn(cap, unit)} {unit.symbol}
                </span>
              </span>
              <div className="meter-bar">
                <i className={pct > 80 ? "hot" : ""} style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </div>
            <div className="kv">
              <div>
                <span>Per request</span>
                <b>{amountIn(agent.policy.perActionCap, unit)} {unit.symbol}</b>
              </div>
              <div>
                <span>Requests · blocked</span>
                <b>
                  {requests.length} · {blocked}
                </b>
              </div>
            </div>
            <div>
              <span className="section-label">Approved counterparties</span>
              <div className="chips">
                {agent.policy.counterparties.map((c) => (
                  <span key={c.address} className="chip" title={c.address}>
                    {c.label} <code>{short(c.address, 4, 4)}</code>
                  </span>
                ))}
              </div>
            </div>
            <footer>
              <code>{agent.keyPrefix}…</code>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button className="btn btn-ghost btn-sm" onClick={() => onConnect(agent)}>
                  Connect
                </button>
                {role === "owner" && (
                  <button className="btn btn-ghost btn-sm" onClick={() => onEdit(agent)}>
                    Edit limits
                  </button>
                )}
                {(agent.enabled || role === "owner") && (
                  <button className={`btn btn-sm ${agent.enabled ? "btn-danger" : "btn-primary"}`} onClick={() => onToggle(agent)}>
                    {agent.enabled ? "Pause" : "Resume"}
                  </button>
                )}
              </span>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

type CounterpartyDraft = { address: string; label: string };

function AgentDialog({ state, treasuryId, unit, onClose, onSaved }: { state: { mode: "create" } | { mode: "edit"; agent: Agent } | null; treasuryId: string; unit: Unit; onClose: () => void; onSaved: (r: { agent: Agent; apiKey?: string }) => void }) {
  const [name, setName] = useState("");
  const [perAction, setPerAction] = useState("");
  const [rolling, setRolling] = useState("");
  const [windowHours, setWindowHours] = useState(24);
  const [counterparties, setCounterparties] = useState<CounterpartyDraft[]>([{ address: "", label: "" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    if (state?.mode === "edit") {
      const p = state.agent.policy;
      setName(state.agent.name);
      setPerAction(formatAmount(p.perActionCap, unit.decimals, 0).replace(/,/g, ""));
      setRolling(formatAmount(p.rollingCap.amount, unit.decimals, 0).replace(/,/g, ""));
      setWindowHours(p.rollingCap.windowSeconds / 3600);
      setCounterparties(p.counterparties.map((c) => ({ ...c })));
    } else if (state?.mode === "create") {
      setName("");
      setPerAction("");
      setRolling("");
      setWindowHours(24);
      setCounterparties([{ address: "", label: "" }]);
    }
  }, [state]);

  const preview = useMemo(() => {
    const filled = counterparties.filter((c) => c.address.trim()).length;
    return `${name || "This agent"} can request up to ${perAction || "—"} ${unit.symbol} per payment and ${rolling || "—"} ${unit.symbol} per ${describeWindow(windowHours * 3600)} window, to ${filled} approved ${filled === 1 ? "address" : "addresses"}. Every request still needs your approval.`;
  }, [name, perAction, rolling, windowHours, counterparties, unit.symbol]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = { name, perActionCap: perAction, rollingCap: rolling, windowHours, counterparties: counterparties.filter((c) => c.address.trim()) };
    try {
      if (state?.mode === "edit") {
        const { agent } = await api<{ agent: Agent }>(`/agents/${state.agent.id}`, { method: "PUT", body });
        onSaved({ agent });
      } else {
        onSaved(await api<{ agent: Agent; apiKey: string }>(`/treasuries/${treasuryId}/agents`, { body }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the limits.");
    } finally {
      setBusy(false);
    }
  }

  const editing = state?.mode === "edit";
  return (
    <Modal open={!!state} onClose={onClose} eyebrow={editing ? `Limits v${state.agent.policy.version} → v${state.agent.policy.version + 1}` : "New agent"} title={editing ? `Edit ${state.agent.name}'s limits` : "Give an agent spending limits"}>
      <form className="form-grid" onSubmit={submit}>
        {!editing && (
          <label className="field">
            Agent name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name this agent" maxLength={60} required />
          </label>
        )}
        <div className="form-row">
          <label className="field">
            Max per request
            <span className="input-affix">
              <input className="input" inputMode="decimal" value={perAction} onChange={(e) => setPerAction(e.target.value)} placeholder="0.00" required />
              <span>{unit.symbol}</span>
            </span>
          </label>
          <label className="field">
            Rolling budget
            <span className="input-affix">
              <input className="input" inputMode="decimal" value={rolling} onChange={(e) => setRolling(e.target.value)} placeholder="0.00" required />
              <span>{unit.symbol}</span>
            </span>
          </label>
        </div>
        <label className="field">
          Budget window
          <select className="select" value={windowHours} onChange={(e) => setWindowHours(Number(e.target.value))}>
            <option value={1}>1 hour</option>
            <option value={24}>24 hours</option>
            <option value={168}>7 days</option>
            <option value={720}>30 days</option>
          </select>
        </label>
        <div className="field">
          Approved counterparties
          <small>{unit.recipientLabel.replace(/^a /, "")}es this agent may pay{unit.symbol === "NEAR" ? "" : ", or https:// sellers it may buy from (x402)"}. Anything else is blocked automatically.</small>
          {counterparties.map((c, i) => (
            <div key={i} className="counterparty-row">
              <input className="input" value={c.label} onChange={(e) => setCounterparties((list) => list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} placeholder="Label" maxLength={60} />
              <input className="input mono" value={c.address} onChange={(e) => setCounterparties((list) => list.map((x, j) => (j === i ? { ...x, address: e.target.value } : x)))} placeholder={unit.symbol === "NEAR" ? "account.testnet" : "0x… or https://api.seller.com"} spellCheck={false} />
              <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setCounterparties((list) => (list.length > 1 ? list.filter((_, j) => j !== i) : [{ address: "", label: "" }]))}>
                ×
              </button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: "start" }} onClick={() => setCounterparties((list) => [...list, { address: "", label: "" }])}>
            + Add address
          </button>
        </div>
        <div className="notice info">{preview}</div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-foot" style={{ padding: 0 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy && <Spinner />} {editing ? "Save new limits" : "Create agent"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KeyReveal({ state, onClose }: { state: { name: string; key: string; renewed?: boolean } | null; onClose: () => void }) {
  return (
    <Modal
      open={!!state}
      onClose={onClose}
      eyebrow={state?.renewed ? "New key" : "Agent created"}
      title={`${state?.name ?? "Agent"}'s key`}
      footer={
        <button className="btn btn-primary" onClick={onClose}>
          I&apos;ve stored it
        </button>
      }
    >
      <div className="notice">
        {state?.renewed ? "The old key has stopped working. " : ""}This is the only time this key is shown. If you lose it, make a new one from Connect.
      </div>
      <Secret value={state?.key ?? ""} />
      {state && <ConnectGuide apiKey={state.key} />}
    </Modal>
  );
}

function Secret({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="secret">
      <span>{value}</span>
      <button
        className="btn btn-signal btn-sm"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

// How to plug an agent in: as a tool for an AI assistant (MCP), or from any code over HTTPS.
function ConnectGuide({ apiKey }: { apiKey: string }) {
  const [how, setHow] = useState<"ai" | "code">("ai");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const mcp = JSON.stringify({ mcpServers: { scrim: { type: "http", url: `${origin}/api/mcp`, headers: { Authorization: `Bearer ${apiKey}` } } } }, null, 2);
  const curl = `curl -X POST ${origin}/api/v1/agent/payments \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Idempotency-Key: <unique-id>" \\
  -H "Content-Type: application/json" \\
  -d '{"recipient":"<recipient>","amount":"<amount>","memo":"<what it is for>"}'`;
  return (
    <div className="connect-guide">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={how === "ai"} onClick={() => setHow("ai")}>AI assistant</button>
        <button role="tab" aria-selected={how === "code"} onClick={() => setHow("code")}>Your code</button>
      </div>
      {how === "ai" ? (
        <>
          <p className="muted">Add Scrim as a tool (MCP server) in Claude or any assistant that supports MCP. It can check its limits and ask to pay. People still approve.</p>
          <div className="code"><pre>{mcp}</pre></div>
        </>
      ) : (
        <>
          <p className="muted">Ask to pay from any program. Check its limits with GET /api/v1/agent and a request with GET /api/v1/agent/payments/&lt;id&gt;.</p>
          <div className="code"><pre>{curl}</pre></div>
        </>
      )}
    </div>
  );
}

function ConnectDialog({ agent, role, onClose, onNewKey, onChanged }: { agent: Agent | null; role: TreasuryRole; onClose: () => void; onNewKey: (agent: Agent, key: string) => void; onChanged: () => void }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const owner = role === "owner";

  useEffect(() => {
    setUrl(agent?.webhookUrl ?? "");
    setSecret(null);
  }, [agent?.id, agent?.webhookUrl]);

  if (!agent) return null;

  const rotate = async () => {
    if (!confirm(`Make a new key for ${agent.name}? The current key stops working right away.`)) return;
    setBusy("key");
    try {
      const result = await api<{ agent: Agent; apiKey: string }>(`/agents/${agent.id}/key`, { method: "POST" });
      onNewKey(result.agent, result.apiKey);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const saveWebhook = async (value: string | null) => {
    setBusy("hook");
    try {
      const result = await api<{ agent: Agent; signingSecret: string | null }>(`/agents/${agent.id}/webhook`, { method: "PUT", body: { url: value } });
      setSecret(result.signingSecret);
      if (!value) setUrl("");
      toast(value ? "Updates will be sent to this address" : "Updates turned off");
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy("");
    }
  };

  const last = agent.lastDelivery;
  return (
    <Modal open onClose={onClose} eyebrow="Connect" title={`Connect ${agent.name}`}>
      <section className="connect-block">
        <span className="section-label">Key</span>
        <div className="connect-row">
          <code>{agent.keyPrefix}…</code>
          <small className="muted">{agent.keyRotatedAt ? `Replaced ${relativeTime(agent.keyRotatedAt)}` : `Made ${relativeTime(agent.createdAt)}`}</small>
          {owner && (
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={rotate}>
              {busy === "key" ? <Spinner /> : "Make a new key"}
            </button>
          )}
        </div>
        <p className="muted">The key lets this agent ask to pay within its limits. It can&apos;t approve or move money. Lost or leaked? Make a new one.</p>
      </section>

      <section className="connect-block">
        <span className="section-label">Updates to your agent</span>
        <p className="muted">Scrim calls this address when a request is approved, paid, stopped or cancelled, so the agent doesn&apos;t have to keep checking.</p>
        <div className="connect-row">
          <input className="input" placeholder="https://your-agent.example/scrim" value={url} disabled={!owner} onChange={(e) => setUrl(e.target.value)} />
          {owner && (
            <button className="btn btn-primary btn-sm" disabled={!!busy || !url.trim()} onClick={() => saveWebhook(url.trim())}>
              {busy === "hook" ? <Spinner /> : "Save"}
            </button>
          )}
          {owner && agent.webhookUrl && (
            <button className="btn btn-ghost btn-sm" disabled={!!busy} onClick={() => saveWebhook(null)}>
              Remove
            </button>
          )}
        </div>
        {secret && (
          <>
            <div className="notice">Signing secret, shown once. Use it to check the Scrim-Signature header on each update.</div>
            <Secret value={secret} />
          </>
        )}
        {last && (
          <small className={last.ok ? "ok-text" : "bad-text"}>
            Last update: {last.event.replace("payment.", "")} · {last.ok ? "delivered" : `not delivered${last.statusCode ? ` (${last.statusCode})` : ""}`} · {relativeTime(last.at)}
          </small>
        )}
      </section>

      <AgentWalletBlock agent={agent} owner={owner} onChanged={onChanged} />

      <section className="connect-block">
        <span className="section-label">Plug it in</span>
        <ConnectGuide apiKey={`${agent.keyPrefix}…`} />
        <small className="muted">Use the full key you saved in place of {agent.keyPrefix}…</small>
      </section>
    </Modal>
  );
}

type AgentWallet = {
  network: string;
  accountId: string;
  autonomous: boolean;
  private: boolean;
  policyUrl: string | null;
  fundUrl: string;
  balances: { near: string | null; usdc: string | null; usdcIntents: string | null; usdcPrivate: string | null };
};

// The agent's own wallet on OutLayer. With it, the owner can let the agent pay by itself within its limits.
function AgentWalletBlock({ agent, owner, onChanged }: { agent: Agent; owner: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [wallet, setWallet] = useState<AgentWallet | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [fund, setFund] = useState({ chain: "base", amount: "" });
  const [deposit, setDeposit] = useState<{ chain: string; address: string; amount: string } | null>(null);

  useEffect(() => {
    let live = true;
    setWallet(undefined);
    setDeposit(null);
    api<{ wallet: AgentWallet | null }>(`/agents/${agent.id}/wallet`)
      .then((r) => live && setWallet(r.wallet))
      .catch(() => live && setWallet(null));
    return () => {
      live = false;
    };
  }, [agent.id]);

  const act = async (method: "POST" | "PATCH", body?: unknown) => {
    setBusy(true);
    try {
      setWallet((await api<{ wallet: AgentWallet }>(`/agents/${agent.id}/wallet`, { method, body })).wallet);
      onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const fundPrivately = async () => {
    setBusy(true);
    try {
      setDeposit((await api<{ deposit: { chain: string; address: string; amount: string } }>(`/agents/${agent.id}/wallet/deposit`, { method: "POST", body: fund })).deposit);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const toggle = (on: boolean) => {
    if (on && !confirm(`Let ${agent.name} pay by itself? Payments within its limits will be sent from its own wallet without approval.`)) return;
    void act("PATCH", { autonomous: on });
  };

  return (
    <section className="connect-block">
      <span className="section-label">Agent wallet</span>
      {wallet === undefined ? (
        <Spinner />
      ) : wallet === null ? (
        <>
          <p className="muted">Give {agent.name} a wallet of its own, secured by OutLayer. You fund it and set its spending rules; then it can pay within its limits without waiting for approval.</p>
          {owner && (
            <div className="connect-row">
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => act("POST")}>
                {busy ? <Spinner /> : "Create wallet"}
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="connect-row">
            <code>{wallet.accountId.length > 24 ? `${wallet.accountId.slice(0, 10)}…${wallet.accountId.slice(-8)}` : wallet.accountId}</code>
            <small className="muted">
              {[wallet.balances.near && `${wallet.balances.near} NEAR`, wallet.balances.usdc && `${wallet.balances.usdc} USDC`, !wallet.private && wallet.balances.usdcIntents && `${wallet.balances.usdcIntents} USDC ready to pay`, wallet.private && wallet.balances.usdcPrivate && `${wallet.balances.usdcPrivate} USDC private`].filter(Boolean).join(" · ") || "Balance unavailable"}
            </small>
          </div>
          {owner && (
            <div className="connect-row">
              {!wallet.private && <a className="btn btn-ghost btn-sm" href={wallet.fundUrl} target="_blank" rel="noreferrer">Add funds</a>}
              {wallet.policyUrl && <a className="btn btn-ghost btn-sm" href={wallet.policyUrl} target="_blank" rel="noreferrer">Spending rules</a>}
              <button className={`btn btn-sm ${wallet.autonomous ? "btn-ghost" : "btn-primary"}`} disabled={busy} onClick={() => toggle(!wallet.autonomous)}>
                {busy ? <Spinner /> : wallet.autonomous ? "Ask before paying" : "Let it pay by itself"}
              </button>
            </div>
          )}
          {owner && wallet.network === "mainnet" && (
            <div className="segmented" role="radiogroup" aria-label="How it pays">
              <button role="radio" aria-checked={wallet.private} disabled={busy} onClick={() => !wallet.private && act("PATCH", { private: true })}>Private</button>
              <button role="radio" aria-checked={!wallet.private} disabled={busy} onClick={() => wallet.private && act("PATCH", { private: false })}>Public</button>
            </div>
          )}
          {wallet.network === "mainnet" && (
            <p className="muted">
              {wallet.private
                ? "Pays from its private balance: recipients see the payment arrive, but not that it came from this wallet."
                : "Pays from its public balance: every payment can be looked up on the blockchain."}
            </p>
          )}
          {owner && wallet.private && (
            <div className="form-grid">
              <span className="section-label">Add funds privately (USDC)</span>
              <div className="connect-row">
                <select className="input" value={fund.chain} onChange={(e) => { setFund({ ...fund, chain: e.target.value }); setDeposit(null); }}>
                  <option value="base">Base</option><option value="ethereum">Ethereum</option><option value="arbitrum">Arbitrum</option><option value="solana">Solana</option><option value="near">NEAR</option>
                </select>
                <input className="input" inputMode="decimal" placeholder="25" value={fund.amount} onChange={(e) => { setFund({ ...fund, amount: e.target.value }); setDeposit(null); }} />
                <button className="btn btn-primary btn-sm" disabled={busy || !fund.amount.trim()} onClick={fundPrivately}>{busy ? <Spinner /> : "Get address"}</button>
              </div>
              {deposit && (
                <>
                  <div className="notice">Send {deposit.amount} USDC on {deposit.chain[0].toUpperCase() + deposit.chain.slice(1)} to this address. It lands in the agent&apos;s private balance.</div>
                  <Secret value={deposit.address} />
                </>
              )}
            </div>
          )}
          <p className="muted">
            {wallet.autonomous
              ? `${agent.name} pays by itself from this wallet, within its limits here and its spending rules on OutLayer.`
              : `${agent.name} asks and people approve. Payments come from the team.`}
          </p>
        </>
      )}
    </section>
  );
}

function Signers({ treasury, accountId }: { treasury: Treasury; accountId: string }) {
  return (
    <div className="card signer-list">
      <div className="signer-row" style={{ background: "var(--paper)" }}>
        <span className="muted" style={{ fontSize: 13 }}>
          Payments need <b style={{ color: "var(--ink)" }}>{treasury.thresholdRequired}</b> of {treasury.signers.length} approvals. Each person signs in with their own NEAR wallet to approve.
        </span>
      </div>
      {treasury.signers.map((s) => (
        <div key={s.accountId} className="signer-row">
          <span className="who">
            <Initials name={s.accountId} className="avatar" />
            <span>
              {s.accountId}
              {s.accountId === accountId && <span className="muted"> (you)</span>}
            </span>
          </span>
          <span className={`pill ${s.role === "owner" ? "pill-dark" : ""} plain`}>{s.role === "owner" ? "Owner" : "Approver"}</span>
        </div>
      ))}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "treasury.created": "Treasury created",
  "agent.created": "Agent created",
  "agent.mandate_updated": "Limits updated",
  "agent.paused": "Agent paused",
  "agent.resumed": "Agent resumed",
  "payment.requested": "Payment requested",
  "payment.policy_rejected": "Blocked by spending limits",
  "payment.approved": "Approval signed",
  "payment.cancelled": "Request cancelled",
};

function Audit({ events, agents }: { events: AuditEvent[]; agents: Agent[] }) {
  const actor = (e: AuditEvent) => (e.actor_type === "agent" ? (agents.find((a) => a.id === e.actor_id)?.name ?? "Agent") : e.actor_id);
  const detail = (e: AuditEvent) => {
    const d = e.data;
    if (e.action === "payment.approved") return `${d.approvals}/${d.threshold}${d.thresholdReached ? " · threshold reached" : ""}`;
    if (e.action === "payment.policy_rejected") return `failed: ${(d.failedRules as string[] | undefined)?.join(", ").replace(/_/g, " ")}`;
    if (e.action.startsWith("agent.") && d.policyVersion) return `v${d.policyVersion}`;
    return "";
  };
  return (
    <div className="card">
      <ul className="timeline">
        {events.map((e) => (
          <li key={e.id}>
            <time dateTime={e.created_at}>{new Date(e.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
            <span>
              <b>{ACTION_LABEL[e.action] ?? STATUS_LABEL[e.action] ?? e.action}</b> <span className="muted">by {actor(e)}</span>
              {detail(e) && <span className="muted"> · {detail(e)}</span>}
            </span>
            <code>#{e.id}</code>
          </li>
        ))}
      </ul>
    </div>
  );
}

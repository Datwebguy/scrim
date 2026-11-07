// Agents end to end on real NEAR testnet accounts: limits, key replacement, webhooks, the MCP server
// and Telegram linking.
import { createHmac } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentOverview } from "@/server/agent-api";
import { agentWallet, setAutonomous } from "@/server/agent-wallets";
import { agentFromApiKey, createAgent, rotateAgentKey, setAgentWebhook } from "@/server/agents";
import type { Session } from "@/server/auth";
import { sql } from "@/server/db";
import { handleMcp } from "@/server/mcp";
import { deliver, signWebhook } from "@/server/notify";
import { safePublicUrl } from "@/server/safe-fetch";
import { createAgentPayment, getAgentPayment } from "@/server/payments";
import { handleTelegramUpdate } from "@/server/telegram";
import { createTreasury } from "@/server/treasuries";
import { createTestnetWallet, resetDatabase, signInAs, type Wallet } from "./live";

let owner: Wallet, payee: Wallet, ownerSession: Session, treasuryId: string, apiKey: string, agentId: string;
const settle = () => new Promise((r) => setTimeout(r, 300));

beforeAll(async () => {
  await resetDatabase();
  [owner, payee] = await Promise.all([createTestnetWallet("scrim-a-owner"), createTestnetWallet("scrim-a-payee")]);
  ownerSession = (await signInAs(owner)).session;
  treasuryId = (await createTreasury(ownerSession, { name: "Agents", kind: "individual", signers: [], threshold: 1 })).id;
  const created = await createAgent(ownerSession, treasuryId, {
    name: "Bills bot",
    perActionCap: "1",
    rollingCap: "1.5",
    windowHours: 24,
    counterparties: [{ address: payee.accountId, label: "Payee" }],
  });
  apiKey = created.apiKey;
  agentId = created.agent.id;
}, 120_000);
afterAll(async () => {
  await settle();
  await sql.end();
});

describe("limits", () => {
  it("lets requests inside the limits wait for people, and stops the rest", async () => {
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    const fine = await createAgentPayment(agent, { recipient: payee.accountId, amount: "1", idempotencyKey: "agent-fine-0001" });
    expect(fine.status).toBe("awaiting_approval");
    const tooMuch = await createAgentPayment(agent, { recipient: payee.accountId, amount: "1", idempotencyKey: "agent-over-0001" });
    expect(tooMuch.status).toBe("policy_rejected");
    const stranger = await createAgentPayment(agent, { recipient: owner.accountId, amount: "0.1", idempotencyKey: "agent-strn-0001" });
    expect(stranger.status).toBe("policy_rejected");
    const view = await agentOverview(agent);
    expect(view.currency.symbol).toBe("NEAR");
    expect(view.limits.perPayment).toBe("1.00");
    expect(view.budget.remainingFormatted).toBe("0.50");
  });
});

describe("repeats", () => {
  it("holds a second request for the same recipient and amount until a person confirms it", async () => {
    const created = await createAgent(ownerSession, treasuryId, {
      name: "Retry bot",
      perActionCap: "1",
      rollingCap: "5",
      windowHours: 24,
      counterparties: [{ address: payee.accountId, label: "Payee" }],
    });
    const agent = await agentFromApiKey(`Bearer ${created.apiKey}`);
    const first = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.3", idempotencyKey: "repeat-first-01" });
    expect(first.status).toBe("awaiting_approval");
    expect(first.policyDecision?.hold).toBeUndefined();

    // The same request again, as a fresh retry after a note that says the payment failed.
    const again = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.3", idempotencyKey: "repeat-again-01" });
    expect(again.status).toBe("awaiting_approval");
    expect(again.policyDecision?.allowed).toBe(true);
    expect(again.policyDecision?.hold?.reason).toBe("repeat");
    expect(again.policyDecision?.hold?.detail).toMatch(/minute/);

    // A different amount is a different payment, and the same Idempotency-Key still returns the first request.
    const other = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.4", idempotencyKey: "repeat-other-01" });
    expect(other.policyDecision?.hold).toBeUndefined();
    const same = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.3", idempotencyKey: "repeat-first-01" });
    expect(same.id).toBe(first.id);
    expect(same.policyDecision?.hold).toBeUndefined();
  });

  it("does not hold a retry of a payment that failed or was cancelled", async () => {
    const created = await createAgent(ownerSession, treasuryId, {
      name: "Second chance bot",
      perActionCap: "1",
      rollingCap: "5",
      windowHours: 24,
      counterparties: [{ address: payee.accountId, label: "Payee" }],
    });
    const agent = await agentFromApiKey(`Bearer ${created.apiKey}`);
    const first = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.2", idempotencyKey: "second-first-01" });
    await sql`UPDATE payment_requests SET status = 'failed' WHERE id = ${first.id}`;
    const retry = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.2", idempotencyKey: "second-retry-01" });
    expect(retry.policyDecision?.hold).toBeUndefined();
  });
});

describe("replacing a key", () => {
  it("stops the old key at once and the new key works", async () => {
    const { apiKey: fresh } = await rotateAgentKey(ownerSession, agentId);
    await expect(agentFromApiKey(`Bearer ${apiKey}`)).rejects.toThrow(/Unknown agent key/);
    expect((await agentFromApiKey(`Bearer ${fresh}`)).id).toBe(agentId);
    apiKey = fresh;
  });
});

describe("webhooks", () => {
  it("only accepts public https addresses", () => {
    expect(safePublicUrl("https://agent.example.com/hook")).toBe(true);
    for (const bad of ["http://agent.example.com", "https://localhost/x", "https://127.0.0.1/x", "https://10.1.2.3", "https://192.168.0.5", "https://[::1]/", "https://169.254.169.254/latest", "https://user:pw@example.com"]) {
      expect(safePublicUrl(bad)).toBe(false);
    }
  });

  it("signs each delivery so the agent can check it came from Scrim", () => {
    const body = '{"type":"payment.approved"}';
    const header = signWebhook("whsec_test", body, 1700000000);
    expect(header).toBe(`t=1700000000,v1=${createHmac("sha256", "whsec_test").update(`1700000000.${body}`).digest("hex")}`);
  });

  it("saves the address, returns a signing secret once, and records each delivery", async () => {
    await expect(setAgentWebhook(ownerSession, agentId, "http://insecure.example")).rejects.toThrow(/https/);
    const { agent, signingSecret } = await setAgentWebhook(ownerSession, agentId, "https://scrim-webhook-test.invalid/hook");
    expect(signingSecret).toMatch(/^whsec_/);
    expect(agent.webhookUrl).toBe("https://scrim-webhook-test.invalid/hook");
    const [request] = await sql<{ id: string }[]>`SELECT id FROM payment_requests WHERE agent_id = ${agentId} ORDER BY created_at LIMIT 1`;
    await deliver(request.id, "payment.approved");
    const [row] = await sql<{ ok: boolean; event: string }[]>`SELECT ok, event FROM webhook_deliveries WHERE agent_id = ${agentId} ORDER BY id DESC LIMIT 1`;
    expect(row).toMatchObject({ ok: false, event: "payment.approved" }); // the address does not exist, and that is recorded
    const cleared = await setAgentWebhook(ownerSession, agentId, null);
    expect(cleared.agent.webhookUrl).toBeNull();
  });
});

describe("MCP server", () => {
  const call = (body: unknown, key: string | null = apiKey) => handleMcp(body, key ? `Bearer ${key}` : null);

  it("introduces itself and lists its tools only to a real agent key", async () => {
    const init = await call({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, null);
    expect(init.body).toMatchObject({ result: { protocolVersion: "2025-06-18", serverInfo: { name: "scrim" } } });
    expect((await call({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
    expect((await call({ jsonrpc: "2.0", id: 2, method: "tools/list" }, "scrim_sk_notakey")).status).toBe(401);
    const tools = (await call({ jsonrpc: "2.0", id: 3, method: "tools/list" })).body as { result: { tools: { name: string }[] } };
    expect(tools.result.tools.map((t) => t.name)).toEqual(["get_limits", "check_payment", "request_payment", "find_paid_apis", "pay_x402", "list_payments", "get_payment"]);
  });

  it("asks to pay through a tool, and the request follows the same limits", async () => {
    const res = (await call({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "request_payment", arguments: { recipient: payee.accountId, amount: "0.5", memo: "via MCP", idempotency_key: "mcp-test-0001" } } })).body as {
      result: { structuredContent: { payment: { id: string; status: string } }; isError: boolean };
    };
    expect(res.result.isError).toBe(false);
    expect(res.result.structuredContent.payment.status).toBe("awaiting_approval");
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    expect((await getAgentPayment(agent, res.result.structuredContent.payment.id)).memo).toBe("via MCP");

    const over = (await call({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "request_payment", arguments: { recipient: payee.accountId, amount: "0.5", idempotency_key: "mcp-test-0002" } } })).body as {
      result: { structuredContent: { payment: { status: string } } };
    };
    expect(over.result.structuredContent.payment.status).toBe("policy_rejected");

    const bad = (await call({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "request_payment", arguments: { recipient: "Not A Name!", amount: "1" } } })).body as { result: { isError: boolean } };
    expect(bad.result.isError).toBe(true);
    const unknown = (await call({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "approve_payment", arguments: {} } })).body as { error: { code: number } };
    expect(unknown.error.code).toBe(-32602);
  });

  it("answers \"would this be allowed?\" without requesting anything", async () => {
    const before = (await sql`SELECT count(*)::int AS n FROM payment_requests`)[0].n;
    const ask = async (id: number, recipient: string, amount: string) =>
      ((await call({ jsonrpc: "2.0", id, method: "tools/call", params: { name: "check_payment", arguments: { recipient, amount } } })).body as {
        result: { isError: boolean; structuredContent: { verdict: string; reasons: { code: string }[] } };
      }).result;
    const stranger = await ask(8, owner.accountId, "0.1");
    expect(stranger.structuredContent.verdict).toBe("refused");
    expect(stranger.structuredContent.reasons.map((r) => r.code)).toContain("RECIPIENT_NOT_ALLOWED");
    expect((await ask(9, payee.accountId, "50")).structuredContent.reasons.map((r) => r.code)).toContain("OVER_PAYMENT_LIMIT");
    expect((await ask(10, "Not A Name!", "1")).isError).toBe(true);
    expect((await sql`SELECT count(*)::int AS n FROM payment_requests`)[0].n).toBe(before);
  });
});

describe("Telegram linking", () => {
  it("links a chat with a one-time code and refuses a used or unknown code", async () => {
    await sql`INSERT INTO telegram_link_codes (code, account_id, network, expires_at) VALUES ('link-code-test-0001', ${owner.accountId}, 'testnet', now() + interval '5 minutes')`;
    await handleTelegramUpdate({ message: { chat: { id: 4242, type: "private" }, text: "/start link-code-test-0001" } });
    const [linked] = await sql<{ chat_id: string }[]>`SELECT chat_id FROM telegram_links WHERE account_id = ${owner.accountId} AND network = 'testnet'`;
    expect(linked.chat_id).toBe("4242");
    await handleTelegramUpdate({ message: { chat: { id: 5555, type: "private" }, text: "/start link-code-test-0001" } });
    const [still] = await sql<{ chat_id: string }[]>`SELECT chat_id FROM telegram_links WHERE account_id = ${owner.accountId} AND network = 'testnet'`;
    expect(still.chat_id).toBe("4242");
  });
});

describe("request limits", () => {
  it("allows a budget per minute per client and then says to wait", async () => {
    const { rateLimit, limitFor } = await import("@/server/rate-limit");
    expect(limitFor("/api/v1/auth/challenge")).toEqual({ group: "/api/v1/auth", perMinute: 20 });
    expect(limitFor("/api/v1/treasuries")).toEqual({ group: "default", perMinute: 300 });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" });
    const now = Date.UTC(2030, 0, 1, 12, 0, 5);
    for (let i = 0; i < 20; i++) await rateLimit(headers, "/api/v1/auth/challenge", now);
    await expect(rateLimit(headers, "/api/v1/auth/challenge", now)).rejects.toThrow(/Too many requests/);
    await rateLimit(headers, "/api/v1/auth/challenge", now + 60_000); // next minute is fresh
    await rateLimit(new Headers({ "x-forwarded-for": "203.0.113.10" }), "/api/v1/auth/challenge", now); // other client is unaffected
  });

  it("refuses webhook addresses that lead inside the network", async () => {
    const { isPrivateAddress } = await import("@/server/safe-fetch");
    for (const a of ["127.0.0.1", "10.0.0.8", "172.20.1.1", "192.168.1.1", "169.254.169.254", "198.18.0.1", "224.0.0.1", "255.255.255.255", "::1", "::", "fd00::1", "64:ff9b::a00:1"]) expect(isPrivateAddress(a)).toBe(true);
    for (const a of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) expect(isPrivateAddress(a)).toBe(false);
  });
});

describe("team payout rules", () => {
  it("never takes a team request from a request body", async () => {
    const { transferFromBody } = await import("@/server/transfer-input");
    const input = transferFromBody({ kind: "withdraw", amount: "1", recipient: "x", teamRequestId: "11111111-1111-1111-1111-111111111111" });
    expect("teamRequestId" in input).toBe(false);
  });

  it("only moves a request from the states it may leave, so a cancelled one stays cancelled", async () => {
    const { markTeamRequest } = await import("@/server/payments");
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    const p = await createAgentPayment(agent, { recipient: payee.accountId, amount: "0.01", idempotencyKey: "rules-req-0001" }).catch(() => null);
    const [row] = await sql<{ id: string }[]>`SELECT id FROM payment_requests WHERE agent_id = ${agentId} ORDER BY created_at DESC LIMIT 1`;
    const id = p?.id ?? row.id;
    await sql`UPDATE payment_requests SET status = 'cancelled' WHERE id = ${id}`;
    const actor = { type: "system" as const, id: "test" };
    expect(await sql.begin((tx) => markTeamRequest(tx, id, "submitting", actor, ["approved"]))).toBe(false);
    expect(await sql.begin((tx) => markTeamRequest(tx, id, "settled", actor, ["submitting"]))).toBe(false);
    const [after] = await sql<{ status: string }[]>`SELECT status FROM payment_requests WHERE id = ${id}`;
    expect(after.status).toBe("cancelled");
  });

  it("lets one testnet transaction settle only one request", async () => {
    const ids = (await sql<{ id: string }[]>`SELECT id FROM payment_requests WHERE agent_id = ${agentId} LIMIT 2`).map((r) => r.id);
    await sql`UPDATE payment_requests SET settled_tx_hash = 'same-hash-0001' WHERE id = ${ids[0]}`;
    await expect(sql`UPDATE payment_requests SET settled_tx_hash = 'same-hash-0001' WHERE id = ${ids[1]}`).rejects.toMatchObject({ code: "23505" });
  });

  it("doesn't deliver a webhook when the address can't be confirmed as public", async () => {
    await setAgentWebhook(ownerSession, agentId, "https://localtest.me/hook");
    const [request] = await sql<{ id: string }[]>`SELECT id FROM payment_requests WHERE agent_id = ${agentId} LIMIT 1`;
    await deliver(request.id, "payment.approved");
    const [row] = await sql<{ ok: boolean; status_code: number | null }[]>`SELECT ok, status_code FROM webhook_deliveries WHERE agent_id = ${agentId} ORDER BY id DESC LIMIT 1`;
    expect(row).toMatchObject({ ok: false, status_code: null });
    await setAgentWebhook(ownerSession, agentId, null);
  });
});

describe("agents paying by themselves", () => {
  it("keeps asking for approval until the owner gives the agent its own wallet", async () => {
    expect(await agentWallet(ownerSession, agentId)).toBeNull();
    await expect(setAutonomous(ownerSession, agentId, true)).rejects.toThrow(/wallet first/);
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    expect(agent.mode).toBe("request_only");
  });

  it("lets only the owner change how the agent pays", async () => {
    const signer = (await signInAs(payee)).session;
    await expect(setAutonomous(signer, agentId, false)).rejects.toThrow();
  });
});

describe("private or public agent wallets", () => {
  it("needs a wallet before choosing, and only mainnet has private balances", async () => {
    const { setWalletPrivate, privateFundingAddress } = await import("@/server/agent-wallets");
    await expect(setWalletPrivate(ownerSession, agentId, true)).rejects.toThrow(/wallet first/);
    await expect(privateFundingAddress(ownerSession, agentId, "base", "5")).rejects.toThrow(/mainnet/);
  });
});

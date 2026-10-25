// One person must never see or touch another's money, history or settings. Three people share this
// database: Ana owns everything, Ben is a stranger, and Cy has only been invited to Ana's shared account.
// Each of them tries, one by one, to read or change what is Ana's.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentWallet, createAgentWallet } from "@/server/agent-wallets";
import { agentFromApiKey, createAgent, listAgents, rotateAgentKey, setAgentEnabled, setAgentWebhook, updateMandate } from "@/server/agents";
import type { Session } from "@/server/auth";
import { sql } from "@/server/db";
import { notices } from "@/server/notifications";
import { cancelPayment, createApprovalChallenge, createHumanPayment, getPayment, listAudit, listPayments } from "@/server/payments";
import { closePayLink, createPayLink, listPayLinks } from "@/server/paylinks";
import { privateStatus } from "@/server/private-access";
import { listProofs, revokeProof } from "@/server/proofs";
import { seal } from "@/server/secrets";
import { cancelTransfer, depositSent, listTransfers, submitSigned } from "@/server/transfers";
import { createTreasury, listInvitations, listTreasuries, treasuryForMember } from "@/server/treasuries";
import { mainnetImplicitWallet, resetDatabase, signInAs } from "./live";

let ana: Session, ben: Session, cy: Session;
let team: string, paymentId: string, agentId: string, linkCode: string, transferId: string, proofId: string;
const MANDATE = { perActionCap: "5", rollingCap: "20", windowHours: 24, counterparties: [{ address: "https://api.example.com", label: "Example" }] };

beforeAll(async () => {
  await resetDatabase();
  [ana, ben, cy] = await Promise.all([signInAs(mainnetImplicitWallet()), signInAs(mainnetImplicitWallet()), signInAs(mainnetImplicitWallet())]).then((r) => r.map((x) => x.session));
  const created = await createTreasury(ana, { name: "Ana's team", kind: "team", signers: [cy.accountId], threshold: 2 }); // Cy is invited, not joined
  team = created.id;
  paymentId = (await createHumanPayment(ana, team, { recipient: "0x00000000000000000000000000000000000000aa", amount: "3", memo: "Ana's private note", idempotencyKey: "iso-payment-0001" })).id;
  const made = await createAgent(ana, team, { name: "Ana's agent", ...MANDATE });
  agentId = made.agent.id;
  linkCode = (await createPayLink(ana, { assetId: "nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1", amount: "5", note: "Ana's invoice" })).code;
  transferId = randomUUID();
  await sql`INSERT INTO transfers (id, account_id, network, kind, status, deposit_address, details_sealed, expires_at)
    VALUES (${transferId}, ${ana.accountId}, 'mainnet', 'send', 'awaiting_deposit', ${"a".repeat(64)}, ${seal({ note: "Ana's transfer" }, `transfer:${transferId}:${ana.accountId}`)}, now() + interval '1 hour')`;
  proofId = randomUUID();
  await sql`INSERT INTO proofs (id, account_id, network, kind, details_sealed, expires_at) VALUES (${proofId}, ${ana.accountId}, 'mainnet', 'payment', ${seal({ payload: {}, token: "t" }, `proof:${proofId}:${ana.accountId}`)}, now() + interval '1 day')`;
}, 120_000);
afterAll(() => sql.end());

const outsiders = (): [string, Session][] => [["a stranger", ben], ["someone only invited", cy]];

describe.each([["a stranger", () => ben], ["someone only invited", () => cy]])("%s", (_name, who) => {
  it("sees none of Ana's lists", async () => {
    const me = who();
    expect(await listTreasuries(me)).toEqual([]);
    expect(await listTransfers(me)).toEqual([]);
    expect(await listPayLinks(me)).toEqual([]);
    expect(await listProofs(me)).toEqual([]);
    expect((await privateStatus(me)).publicKey).not.toBe((await privateStatus(ana)).publicKey);
  });

  it("cannot open or change Ana's account, payments, agents or audit trail", async () => {
    const me = who();
    await expect(treasuryForMember(sql, me.accountId, team, "mainnet")).rejects.toThrow();
    await expect(listPayments(me, team)).rejects.toThrow();
    await expect(listAudit(me, team)).rejects.toThrow();
    await expect(listAgents(me, team)).rejects.toThrow();
    await expect(createHumanPayment(me, team, { recipient: "0x00000000000000000000000000000000000000bb", amount: "1", idempotencyKey: `iso-${me.accountId.slice(0, 8)}-0001` })).rejects.toThrow();
    await expect(createAgent(me, team, { name: "Planted", ...MANDATE })).rejects.toThrow();
    await expect(getPayment(me, paymentId)).rejects.toThrow();
    await expect(cancelPayment(me, paymentId)).rejects.toThrow();
    await expect(createApprovalChallenge(me, paymentId)).rejects.toThrow();
  });

  it("cannot read or change Ana's agents", async () => {
    const me = who();
    await expect(updateMandate(me, agentId, MANDATE)).rejects.toThrow();
    await expect(setAgentEnabled(me, agentId, false)).rejects.toThrow();
    await expect(rotateAgentKey(me, agentId)).rejects.toThrow();
    await expect(setAgentWebhook(me, agentId, "https://example.com/hook")).rejects.toThrow();
    await expect(createAgentWallet(me, agentId)).rejects.toThrow();
    await expect(agentWallet(me, agentId)).rejects.toThrow();
  });

  it("cannot touch Ana's links, transfers or proofs", async () => {
    const me = who();
    await expect(closePayLink(me, linkCode)).rejects.toThrow();
    await expect(cancelTransfer(me, transferId)).rejects.toThrow();
    await expect(depositSent(me, transferId, "1".repeat(50))).rejects.toThrow();
    await expect(submitSigned(me, transferId, { publicKey: "ed25519:x", signature: "x" })).rejects.toThrow();
    await expect(revokeProof(me, proofId)).rejects.toThrow();
    // ...and none of it changed.
    expect((await listPayLinks(ana)).find((l) => l.code === linkCode)?.status).toBe("open");
    const [t] = await sql<{ status: string }[]>`SELECT status FROM transfers WHERE id = ${transferId}`;
    expect(t.status).toBe("awaiting_deposit");
    const [p] = await sql<{ revoked_at: Date | null }[]>`SELECT revoked_at FROM proofs WHERE id = ${proofId}`;
    expect(p.revoked_at).toBeNull();
    expect((await getPayment(ana, paymentId)).status).toBe("awaiting_approval");
    expect((await listAgents(ana, team))[0].enabled).toBe(true);
  });
});

describe("what people are told", () => {
  it("only mentions what is theirs", async () => {
    expect(await notices(ben)).toEqual([]);
    expect(await notices(ana)).toEqual([expect.objectContaining({ href: `/app/accounts/${team}` })]); // her own payment waits on her
    const forCy = await notices(cy);
    expect(forCy).toHaveLength(1);
    expect(forCy[0].text).toContain("invited you");
    expect(forCy[0].href).toBe("/app/accounts"); // the invitation, not Ana's account
    expect((await listInvitations(ben)).length).toBe(0);
  });

  it("keeps an agent's key limited to that agent", async () => {
    const { apiKey } = await rotateAgentKey(ana, agentId);
    const agent = await agentFromApiKey(`Bearer ${apiKey}`);
    expect(agent.id).toBe(agentId);
    await expect(agentFromApiKey(`Bearer ${apiKey.slice(0, -2)}xx`)).rejects.toThrow();
  });

  it("can't be stepped around by a second sign-in on the other network or a different account", async () => {
    expect(outsiders().every(([, s]) => s.accountId !== ana.accountId)).toBe(true);
    expect((await listTreasuries({ ...ana, network: "testnet" })).length).toBe(0); // Ana's mainnet account is not on testnet
  });
});

// Payments an AI app prepares wait in Scrim until the person confirms, declines or they expire, PayBox style.
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { aiRequestForApp, attachTransfer, createAiRequest, declineAiRequest, getAiRequest, markSent, waitingAiRequests } from "@/server/ai-requests";
import { sql } from "@/server/db";
import { seal } from "@/server/secrets";
import { mainnetImplicitWallet, resetDatabase, signInAs } from "./live";

const details = { mode: "swap" as const, from: "nep141:a", to: "nep141:b", amount: "5", summary: "Swap 5 A for 1 B" };

describe("payments an AI app prepares", () => {
  beforeAll(resetDatabase);

  it("waits for the person, who can decline it; the app sees only its own", async () => {
    const me = await signInAs(mainnetImplicitWallet());
    const other = await signInAs(mainnetImplicitWallet());
    await sql`INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ('scl_a', 'Claude', '[]'), ('scl_b', 'Other app', '[]')`;
    const app = { ...me.session, clientId: "scl_a" };
    const id = await createAiRequest(app, { clientId: "scl_a", name: "Claude" }, "swap", details);

    expect((await waitingAiRequests(me.session)).map((r) => r.id)).toEqual([id]);
    expect(await waitingAiRequests(other.session)).toEqual([]);
    expect(await getAiRequest(me.session, id)).toMatchObject({ app: "Claude", state: "waiting_for_you", details });
    await expect(getAiRequest(other.session, id)).rejects.toThrow(/not found/);
    expect(await aiRequestForApp(app, id)).toMatchObject({ request_id: id, state: "waiting_for_you", summary: "Swap 5 A for 1 B" });
    await expect(aiRequestForApp({ ...me.session, clientId: "scl_b" }, id)).rejects.toThrow(/not found/);

    await expect(declineAiRequest(other.session, id)).rejects.toThrow(/not found/);
    await declineAiRequest(me.session, id);
    expect(await aiRequestForApp(app, id)).toMatchObject({ state: "declined" });
    expect(await waitingAiRequests(me.session)).toEqual([]);
    await expect(attachTransfer(me.session, id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/isn't waiting/);
  });

  it("expires after a day", async () => {
    const me = await signInAs(mainnetImplicitWallet());
    const id = await createAiRequest(me.session, { name: "Hermes Agent" }, "send", { ...details, mode: "person", recipient: "ada.near" });
    await sql`UPDATE ai_requests SET expires_at = now() - interval '1 second' WHERE id = ${id}`;
    expect(await getAiRequest(me.session, id)).toMatchObject({ state: "expired" });
    expect(await waitingAiRequests(me.session)).toEqual([]);
    await expect(attachTransfer(me.session, id, "00000000-0000-0000-0000-000000000000")).rejects.toThrow(/expired/);
  });
});

describe("a price the person hasn't paid yet", () => {
  it("keeps the request waiting, and a new price replaces and cancels the old one", async () => {
    const me = await signInAs(mainnetImplicitWallet());
    const id = await createAiRequest(me.session, { name: "Claude" }, "swap", { ...details, source: "wallet" });
    const transfer = async (status: string) => {
      const tid = randomUUID();
      await sql`INSERT INTO transfers (id, account_id, network, kind, status, deposit_address, details_sealed, expires_at)
        VALUES (${tid}, ${me.session.accountId}, 'mainnet', 'swap', ${status}, ${"a".repeat(64)}, ${seal({}, `transfer:${tid}:${me.session.accountId}`)}, now() + interval '1 hour')`;
      return tid;
    };
    const first = await transfer("awaiting_deposit");
    await attachTransfer(me.session, id, first);
    // Waiting for the wallet to pay is still waiting for the person: the link keeps working and Home still lists it.
    expect(await getAiRequest(me.session, id)).toMatchObject({ state: "waiting_for_you" });
    expect((await waitingAiRequests(me.session)).map((r) => r.id)).toEqual([id]);

    const second = await transfer("awaiting_deposit");
    await attachTransfer(me.session, id, second);
    expect((await sql`SELECT status FROM transfers WHERE id = ${first}`)[0].status).toBe("cancelled");

    await sql`UPDATE transfers SET status = 'processing' WHERE id = ${second}`;
    expect(await getAiRequest(me.session, id)).toMatchObject({ state: "in_progress" });
    await expect(attachTransfer(me.session, id, await transfer("awaiting_deposit"))).rejects.toThrow(/isn't waiting/);
  });
});

describe("payments made straight from the wallet", () => {
  it("is done only with a real, successful transaction from this account to this payment", async () => {
    const me = await signInAs(mainnetImplicitWallet());
    const id = await createAiRequest(me.session, { name: "Claude" }, "swap", { ...details, source: "wallet", from: "native:near", to: "nep141:wrap.near" });
    await expect(markSent(me.session, id, "not a hash")).rejects.toThrow(/isn't a NEAR transaction/);
    // Well formed, but not a transaction from this account on NEAR: refused, and the request keeps waiting.
    await expect(markSent(me.session, id, "7Hq5mYyCzHAt3aVDZqP2Y6Ztzm8Lq9Zx3a1qzYb8Wb3K")).rejects.toThrow(/couldn't find that transaction/);
    expect(await getAiRequest(me.session, id)).toMatchObject({ state: "waiting_for_you" });
  });
});

describe("limits", () => {
  it("keeps at most 20 payments waiting for one person", async () => {
    const me = await signInAs(mainnetImplicitWallet());
    for (let i = 0; i < 20; i++) await createAiRequest(me.session, { name: "Spammy app" }, "swap", details);
    await expect(createAiRequest(me.session, { name: "Spammy app" }, "swap", details)).rejects.toThrow(/20 payments are already waiting/);
  });
});

// Payments an AI app prepares wait in Scrim until the person confirms, declines or they expire, PayBox style.
import { beforeAll, describe, expect, it } from "vitest";
import { aiRequestForApp, attachTransfer, createAiRequest, declineAiRequest, getAiRequest, waitingAiRequests } from "@/server/ai-requests";
import { sql } from "@/server/db";
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

// Ask your money against the real NEAR AI Cloud. Runs only when NEARAI_API_KEY is set (it spends credits).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ask } from "@/server/ask";
import { askAccount, chargeQuestion } from "@/server/ask-credits";
import type { Session } from "@/server/auth";
import { sql } from "@/server/db";
import { createTestnetWallet, resetDatabase, signInAs } from "./live";

let session: Session;
beforeAll(async () => {
  await resetDatabase();
  session = (await signInAs(await createTestnetWallet("scrim-ask"))).session;
}, 120_000);
afterAll(() => sql.end());

describe.skipIf(!process.env.NEARAI_API_KEY)("ask your money (NEAR AI Cloud)", () => {
  it("answers from the person's own records, with a signature from the attested key", async () => {
    const result = await ask(session, "What do I hold right now?");
    expect(result.answer).toMatch(/NEAR/);
    expect(result.verification.signed).toBe(true);
    expect(result.verification.attested).toBe(true);
  }, 120_000);
});

describe("ask your money: input", () => {
  it("refuses empty or very long questions before calling anyone", async () => {
    await expect(ask(session, " ")).rejects.toThrow(/3 to 500/);
    await expect(ask(session, "x".repeat(501))).rejects.toThrow(/3 to 500/);
  });

  it("gives each account one free question; after that people pay from their own balance", async () => {
    expect(await askAccount(session)).toMatchObject({ freeLeft: 1, creditUsd: 0, priceUsd: 0.02, questionsLeft: 1, canTopUp: false });
  });

  it("takes the free question once, then asks for payment; a failed answer gives it back", async () => {
    const other = (await signInAs(await createTestnetWallet("scrim-ask-pay"))).session;
    const refund = await chargeQuestion(other);
    expect((await askAccount(other)).freeLeft).toBe(0);
    await expect(chargeQuestion(other)).rejects.toThrow(/free question/);
    await refund();
    expect((await askAccount(other)).freeLeft).toBe(1);
  }, 120_000);
});

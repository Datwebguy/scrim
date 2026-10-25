// Ask your money against the real NEAR AI Cloud. Runs only when NEARAI_API_KEY is set (it spends credits).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ask, askAllowance } from "@/server/ask";
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

  it("gives each account a daily allowance, since answers run on the site's credits", async () => {
    expect(await askAllowance(session)).toEqual({ perDay: 10, left: 10 });
  });
});

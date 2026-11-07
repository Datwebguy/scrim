import { afterEach, describe, expect, it } from "vitest";
import { config } from "../src/server/config";
import { isAdmin } from "../src/server/stats";

// The stats page opens only for the accounts listed in SCRIM_ADMIN_ACCOUNTS.
describe("private stats access", () => {
  const before = process.env.SCRIM_ADMIN_ACCOUNTS;
  afterEach(() => { if (before === undefined) delete process.env.SCRIM_ADMIN_ACCOUNTS; else process.env.SCRIM_ADMIN_ACCOUNTS = before; });

  it("lets nobody in when the list is empty", () => {
    delete process.env.SCRIM_ADMIN_ACCOUNTS;
    expect(config.adminAccounts).toEqual([]);
    expect(isAdmin("scrimapp.near")).toBe(false);
  });

  it("matches listed accounts, ignoring case and spaces", () => {
    process.env.SCRIM_ADMIN_ACCOUNTS = " ScrimApp.near , other.near ";
    expect(isAdmin("scrimapp.near")).toBe(true);
    expect(isAdmin("OTHER.near")).toBe(true);
    expect(isAdmin("someone.near")).toBe(false);
  });
});

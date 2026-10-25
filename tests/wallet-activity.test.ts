// Reads a real testnet account's transactions from the public index. No wallet or keys needed.
import { describe, expect, it } from "vitest";
import { walletActivity } from "@/server/wallet-activity";

describe("wallet activity", () => {
  it("describes a real NEAR transfer in plain words, newest first", async () => {
    const rows = await walletActivity("testnet", "scrim.testnet", 30);
    expect(rows.length).toBeGreaterThan(0);
    expect([...rows].sort((a, b) => b.at.localeCompare(a.at))).toEqual(rows);
    const sent = rows.find((r) => r.hash === "4SFL5rRfp4JAXLwE9W7FvEAyeHdz5MVHjWWWkq2gjrSm");
    expect(sent).toMatchObject({ kind: "sent", label: "Sent", counterparty: "scrimtest.testnet", amount: "100000000000000000000000", ok: true, token: { symbol: "NEAR", decimals: 24 } });
  }, 30_000);
});

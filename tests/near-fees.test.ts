// The NEAR a wallet must hold for a payment, checked against what mainnet actually asked for.
import { describe, expect, it } from "vitest";
import { NEAR_NEEDED, nearText } from "@/protocol/near-fees";

describe("NEAR set aside for a wallet payment", () => {
  it("covers what mainnet asked for a token payment, with the account's own storage on top", () => {
    // Measured: a registration plus a token transfer needed 0.03297 NEAR set aside, from a wallet holding 0.01996.
    expect(NEAR_NEEDED.tokenSend > 32970483444570500000001n).toBe(true);
    expect(nearText(NEAR_NEEDED.tokenSend)).toBe("0.038");
    expect(NEAR_NEEDED.nearPay > NEAR_NEEDED.tokenSend && NEAR_NEEDED.tokenSend > NEAR_NEEDED.wrap && NEAR_NEEDED.wrap > NEAR_NEEDED.unwrap && NEAR_NEEDED.unwrap > NEAR_NEEDED.nearSend).toBe(true);
  });

  it("rounds up for messages", () => {
    expect(nearText(1n)).toBe("0.001");
    expect(nearText(10n ** 21n)).toBe("0.001");
    expect(nearText(10n ** 21n + 1n)).toBe("0.002");
  });
});

// The NEAR a wallet must hold for a payment, checked against what mainnet actually did.
import { describe, expect, it } from "vitest";
import { NEAR_NEEDED, nearText } from "@/protocol/near-fees";

describe("NEAR set aside for a wallet payment", () => {
  it("matches what mainnet accepted and refused for a token payment", () => {
    // Accepted: registration (5 Tgas) plus a USDC transfer (10 Tgas) from a wallet holding 0.01996 NEAR.
    expect(NEAR_NEEDED.tokenSend <= 19956093894884844089155n).toBe(true);
    expect(nearText(NEAR_NEEDED.tokenSend)).toBe("0.02");
    // Cheaper when the receiver already holds the token.
    expect(NEAR_NEEDED.tokenSendRegistered < NEAR_NEEDED.tokenSend).toBe(true);
    expect(NEAR_NEEDED.nearPay > NEAR_NEEDED.tokenSend && NEAR_NEEDED.unwrap > NEAR_NEEDED.nearSend).toBe(true);
  });

  it("rounds up for messages", () => {
    expect(nearText(1n)).toBe("0.001");
    expect(nearText(10n ** 21n)).toBe("0.001");
    expect(nearText(10n ** 21n + 1n)).toBe("0.002");
  });
});

// Zcash addresses: transparent, Sapling and unified (which can hold a shielded Orchard receiver and run past
// 200 characters). The unified addresses below are the published Zcash test vectors; the swap service itself
// accepted each of them for a ZEC payout when this was written.
import { describe, expect, it } from "vitest";
import { checkAddress } from "@/server/assets";

const zcash = { chain: "zec", chainName: "Zcash", depositChain: "zec:mainnet" };
const TRANSPARENT = "t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs";
const UNIFIED_141 = "u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf";
const UNIFIED_178 = "u1ay3aawlldjrmxqnjf5medr5ma6p3acnet464ht8lmwplq5cd3ugytcmlf96rrmtgwldc75x94qn4n8pgen36y8tywlq6yjk7lkf3fa8wzjrav8z2xpxqnrnmjxh8tmz6jhfh425t7f3vy6p4pd3zmqayq49efl2c4xydc0gszg660q9p";
const UNIFIED_213 = "u1pg2aaph7jp8rpf6yhsza25722sg5fcn3vaca6ze27hqjw7jvvhhuxkpcg0ge9xh6drsgdkda8qjq5chpehkcpxf87rnjryjqwymdheptpvnljqqrjqzjwkc2ma6hcq666kgwfytxwac8eyex6ndgr6ezte66706e3vaqrd25dzvzkc69kw0jgywtd0cmq52q5lkw6uh7hyvzjse8ksx";

describe("Zcash addresses", () => {
  it("accepts transparent and unified (shielded) addresses of any real length", () => {
    for (const address of [TRANSPARENT, UNIFIED_141, UNIFIED_178, UNIFIED_213]) expect(checkAddress(zcash, address)).toBe(address);
    expect(UNIFIED_213.length).toBeGreaterThan(128); // the general limit would have refused it
  });

  it("refuses an address from another chain, a mistyped one, and anything with spaces", () => {
    expect(() => checkAddress(zcash, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toThrow(/Zcash address/);
    expect(() => checkAddress(zcash, "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq")).toThrow(/Zcash address/);
    expect(() => checkAddress(zcash, UNIFIED_141.replace("c", "b"))).toThrow(/Zcash address/); // "b" is never in a Zcash address
    expect(() => checkAddress(zcash, `${UNIFIED_141}0`.slice(0, 40))).toThrow(/Zcash address/);
    expect(() => checkAddress(zcash, `${TRANSPARENT} `.replace(/.$/, "x"))).toThrow(/Zcash address/);
    expect(() => checkAddress(zcash, `${UNIFIED_141.slice(0, 70)} ${UNIFIED_141.slice(70)}`)).toThrow();
    expect(() => checkAddress(zcash, `u1${"q".repeat(600)}`)).toThrow();
  });

  it("keeps the shorter limit for other chains", () => {
    expect(() => checkAddress({ chain: "sol", chainName: "Solana", depositChain: "sol:mainnet" }, "1".repeat(200))).toThrow();
  });
});

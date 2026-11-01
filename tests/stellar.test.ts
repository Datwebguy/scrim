// Stellar account addresses: "G" plus 55 base32 characters, ending in a checksum. The valid addresses below
// are real public accounts; each one passes Stellar's version byte and CRC16 checksum.
import { describe, expect, it } from "vitest";
import { checkAddress } from "@/server/assets";

const stellar = { chain: "stellar", chainName: "Stellar", depositChain: null };
const VALID = ["GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ", "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H"];

describe("Stellar addresses", () => {
  it("accepts real account addresses", () => {
    for (const address of VALID) expect(checkAddress(stellar, address)).toBe(address);
  });

  it("catches a single mistyped character through the checksum", () => {
    const typo = VALID[0].slice(0, 20) + (VALID[0][20] === "A" ? "B" : "A") + VALID[0].slice(21);
    expect(() => checkAddress(stellar, typo)).toThrow(/Stellar address/);
  });

  it("refuses other chains' addresses, lowercase, and wrong lengths", () => {
    expect(() => checkAddress(stellar, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913")).toThrow(/Stellar address/);
    expect(() => checkAddress(stellar, VALID[0].toLowerCase())).toThrow(/Stellar address/);
    expect(() => checkAddress(stellar, VALID[0].slice(0, -1))).toThrow(/Stellar address/);
    expect(() => checkAddress(stellar, `S${VALID[0].slice(1)}`)).toThrow(/Stellar address/); // a secret seed starts with S
  });
});

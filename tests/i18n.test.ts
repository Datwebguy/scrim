import { describe, expect, it } from "vitest";
import { LOCALES } from "../src/i18n/locales";
import ko from "../src/i18n/messages/ko";
import id from "../src/i18n/messages/id";
import zh from "../src/i18n/messages/zh";
import es from "../src/i18n/messages/es";
import pt from "../src/i18n/messages/pt";
import ru from "../src/i18n/messages/ru";
import tr from "../src/i18n/messages/tr";
import vi from "../src/i18n/messages/vi";
import ja from "../src/i18n/messages/ja";

describe("translations", () => {
  const sets = { zh, id, ko, es, pt, ru, tr, vi, ja };
  it("has a file for every language in the list", () => {
    for (const l of LOCALES) if (l.code !== "en") expect(sets[l.code as keyof typeof sets]).toBeDefined();
  });
  it("translates every text for every language", () => {
    const counts = new Set(Object.values(sets).map((m) => Object.keys(m).length));
    expect(counts.size).toBe(1);
  });
  it("keeps every {placeholder} of the English text", () => {
    for (const [name, messages] of Object.entries(sets)) {
      for (const [english, translated] of Object.entries(messages)) {
        const want = (english.match(/\{\w+\}/g) ?? []).sort().join();
        const got = (translated.match(/\{\w+\}/g) ?? []).sort().join();
        expect(got, `${name}: ${english}`).toBe(want);
      }
    }
  });
});

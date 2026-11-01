import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, matchLocale } from "../src/i18n/locales";
import ko from "../src/i18n/messages/ko";
import id from "../src/i18n/messages/id";
import zh from "../src/i18n/messages/zh";

describe("language matching", () => {
  it("takes the first language the browser lists that Scrim speaks", () => {
    expect(matchLocale("ko-KR,ko;q=0.9,en;q=0.8")).toBe("ko");
    expect(matchLocale("zh-CN,zh;q=0.9")).toBe("zh");
    expect(matchLocale("fr-FR,fr;q=0.9,id;q=0.5")).toBe("id");
  });
  it("reads the old Indonesian code", () => expect(matchLocale("in-ID")).toBe("id"));
  it("falls back to English", () => {
    expect(matchLocale("fr-FR,de;q=0.8")).toBe(DEFAULT_LOCALE);
    expect(matchLocale(null)).toBe(DEFAULT_LOCALE);
    expect(matchLocale("")).toBe(DEFAULT_LOCALE);
  });
});

describe("translations", () => {
  const sets = { zh, id, ko };
  it("has a file for every language in the list", () => {
    for (const l of LOCALES) if (l.code !== "en") expect(sets[l.code as keyof typeof sets]).toBeDefined();
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

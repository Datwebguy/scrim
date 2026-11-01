import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, matchLocale } from "../src/i18n/locales";
import ko from "../src/i18n/messages/ko";
import id from "../src/i18n/messages/id";
import zh from "../src/i18n/messages/zh";
import es from "../src/i18n/messages/es";
import pt from "../src/i18n/messages/pt";
import ru from "../src/i18n/messages/ru";
import tr from "../src/i18n/messages/tr";
import vi from "../src/i18n/messages/vi";
import ja from "../src/i18n/messages/ja";

describe("language matching", () => {
  it("takes the first language the browser lists that Scrim speaks", () => {
    expect(matchLocale("ko-KR,ko;q=0.9,en;q=0.8")).toBe("ko");
    expect(matchLocale("zh-CN,zh;q=0.9")).toBe("zh");
    expect(matchLocale("fr-FR,fr;q=0.9,id;q=0.5")).toBe("id");
    expect(matchLocale("pt-BR,pt;q=0.9")).toBe("pt");
    expect(matchLocale("es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(matchLocale("ja,en-US;q=0.7")).toBe("ja");
  });
  it("reads the old Indonesian code", () => expect(matchLocale("in-ID")).toBe("id"));
  it("falls back to English", () => {
    expect(matchLocale("fr-FR,de;q=0.8")).toBe(DEFAULT_LOCALE);
    expect(matchLocale(null)).toBe(DEFAULT_LOCALE);
    expect(matchLocale("")).toBe(DEFAULT_LOCALE);
  });
});

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

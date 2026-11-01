// The languages Scrim speaks. English is the default and the key for every other language: a text with no
// translation shows in English, so a language can be added a screen at a time.
export const LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "zh", name: "简体中文", dir: "ltr" },
  { code: "id", name: "Bahasa Indonesia", dir: "ltr" },
  { code: "ko", name: "한국어", dir: "ltr" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "scrim_lang";

export const isLocale = (value: string | undefined | null): value is Locale => LOCALES.some((l) => l.code === value);

// The best language for a browser's Accept-Language header: the first one it lists that Scrim speaks.
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  for (const part of (acceptLanguage ?? "").split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (!tag) continue;
    const primary = tag.split("-")[0] === "in" ? "id" : tag.split("-")[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

export const directionOf = (locale: Locale): "ltr" | "rtl" => LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";

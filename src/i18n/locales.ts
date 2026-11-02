// The languages Scrim speaks. English is the default and the key for every other language: a text with no
// translation shows in English, so a language can be added a screen at a time.
export const LOCALES = [
  { code: "en", name: "English", dir: "ltr" },
  { code: "zh", name: "简体中文", dir: "ltr" },
  { code: "id", name: "Bahasa Indonesia", dir: "ltr" },
  { code: "ko", name: "한국어", dir: "ltr" },
  { code: "es", name: "Español", dir: "ltr" },
  { code: "pt", name: "Português (Brasil)", dir: "ltr" },
  { code: "ru", name: "Русский", dir: "ltr" },
  { code: "tr", name: "Türkçe", dir: "ltr" },
  { code: "vi", name: "Tiếng Việt", dir: "ltr" },
  { code: "ja", name: "日本語", dir: "ltr" },
] as const;

export type Locale = (typeof LOCALES)[number]["code"];
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "scrim_lang";

export const isLocale = (value: string | undefined | null): value is Locale => LOCALES.some((l) => l.code === value);

export const directionOf = (locale: Locale): "ltr" | "rtl" => LOCALES.find((l) => l.code === locale)?.dir ?? "ltr";

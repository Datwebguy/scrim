import { cookies } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locales";

type Messages = Record<string, string>;

const loaders: Record<Locale, () => Promise<Messages>> = {
  en: async () => ({}),
  zh: () => import("./messages/zh").then((m) => m.default),
  id: () => import("./messages/id").then((m) => m.default),
  ko: () => import("./messages/ko").then((m) => m.default),
  es: () => import("./messages/es").then((m) => m.default),
  pt: () => import("./messages/pt").then((m) => m.default),
  ru: () => import("./messages/ru").then((m) => m.default),
  tr: () => import("./messages/tr").then((m) => m.default),
  vi: () => import("./messages/vi").then((m) => m.default),
  ja: () => import("./messages/ja").then((m) => m.default),
};

// The language the person picked, else English. Scrim never switches language on its own.
export async function getLocale(): Promise<Locale> {
  const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
}

export const getMessages = (locale: Locale) => loaders[locale]();

// The translator for server components: const t = await getT(); t("Text") or t("Hello {name}", { name }).
export async function getT() {
  const messages = await getMessages(await getLocale());
  return (text: string, vars?: Record<string, string | number>) => {
    const out = messages[text] ?? text;
    return vars ? out.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) : out;
  };
}

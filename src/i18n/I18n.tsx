"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { LOCALE_COOKIE, LOCALES, type Locale } from "./locales";

type Messages = Record<string, string>;
type Vars = Record<string, string | number>;
type Value = { locale: Locale; t: (text: string, vars?: Vars) => string };

const I18nContext = createContext<Value>({ locale: "en", t: (text, vars) => fill(text, vars) });

function fill(text: string, vars?: Vars): string {
  return vars ? text.replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole)) : text;
}

export function I18nProvider({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  const value = useMemo<Value>(() => ({ locale, t: (text, vars) => fill(messages[text] ?? text, vars) }), [locale, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// t("Send {coin}", { coin: "USDC" }): the English text is the key; a missing translation shows the English.
export const useT = () => useContext(I18nContext).t;
const useLocale = () => useContext(I18nContext).locale;

// A small language picker. Saves the choice for a year and reloads the page in that language.
export function LanguageMenu({ className = "" }: { className?: string }) {
  const locale = useLocale();
  return (
    <label className={`lang-menu ${className}`}>
      <span className="sr-only">Language</span>
      <svg className="lang-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18Z" /></svg>
      <select
        value={locale}
        aria-label="Language"
        onChange={(e) => {
          document.cookie = `${LOCALE_COOKIE}=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
          window.location.reload();
        }}
      >
        {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
      </select>
    </label>
  );
}

// What the offer says, written in the language it offers, since the page is still in English when it shows.
const OFFER: Record<Exclude<Locale, "en">, { text: string; action: string }> = {
  zh: { text: "Scrim 提供简体中文", action: "切换" },
  id: { text: "Scrim tersedia dalam Bahasa Indonesia", action: "Ganti" },
  ko: { text: "Scrim을 한국어로 볼 수 있어요", action: "전환" },
  es: { text: "Scrim está disponible en español", action: "Cambiar" },
  pt: { text: "A Scrim está disponível em português", action: "Mudar" },
  ru: { text: "Scrim доступен на русском", action: "Переключить" },
  tr: { text: "Scrim Türkçe olarak da mevcut", action: "Geç" },
  vi: { text: "Scrim có tiếng Việt", action: "Chuyển" },
  ja: { text: "Scrim は日本語でも使えます", action: "切り替える" },
};
const HINT_COOKIE = "scrim_lang_hint";
const saveCookie = (name: string, value: string) => { document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`; };

// Like the browser's own translate bar: when the browser prefers a language Scrim speaks and the person hasn't
// chosen one, offer it. Nothing changes until they say yes, and "no" is remembered for a year.
export function LanguageOffer() {
  const locale = useLocale();
  const [offer, setOffer] = useState<Exclude<Locale, "en"> | null>(null);
  useEffect(() => {
    if (locale !== "en" || document.cookie.includes(`${LOCALE_COOKIE}=`) || document.cookie.includes(`${HINT_COOKIE}=`)) return;
    for (const tag of navigator.languages ?? []) {
      const primary = tag.toLowerCase().split("-")[0] === "in" ? "id" : tag.toLowerCase().split("-")[0];
      if (primary === "en") return;
      if (primary in OFFER) { setOffer(primary as Exclude<Locale, "en">); return; }
    }
  }, [locale]);
  if (!offer) return null;
  const { text, action } = OFFER[offer];
  return (
    <div className="lang-offer" role="region" aria-label="Language">
      <span>{text}</span>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => { saveCookie(LOCALE_COOKIE, offer); window.location.reload(); }}>{action}</button>
      <button type="button" className="icon-btn" aria-label="Keep English" onClick={() => { saveCookie(HINT_COOKIE, "no"); setOffer(null); }}>✕</button>
    </div>
  );
}

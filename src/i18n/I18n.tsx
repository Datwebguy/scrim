"use client";
import { createContext, useContext, useMemo } from "react";
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

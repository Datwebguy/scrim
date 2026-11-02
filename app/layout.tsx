import type { Metadata, Viewport } from "next";
import { DM_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { THEME_SCRIPT } from "@/client/theme-script";
import { I18nProvider, LanguageOffer } from "@/i18n/I18n";
import { directionOf } from "@/i18n/locales";
import { getLocale, getMessages } from "@/i18n/server";

const sans = Manrope({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Scrim · Money on NEAR, private when you want it", template: "%s · Scrim" },
  description:
    "Hold, send, swap and get paid on NEAR, in public or in private, your choice. Set limits, share approvals, and let agents pay within your rules.",
};

export const viewport: Viewport = { themeColor: "#151512" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  const messages = await getMessages(locale);
  return (
    <html lang={locale} dir={directionOf(locale)} className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} /></head>
      <body><I18nProvider locale={locale} messages={messages}>{children}<LanguageOffer /></I18nProvider></body>
    </html>
  );
}

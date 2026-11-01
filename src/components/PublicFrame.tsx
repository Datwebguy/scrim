import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageMenu } from "@/i18n/I18n";
import { getT } from "@/i18n/server";
import { Wordmark } from "@/components/Wordmark";

export async function PublicFrame({ children }: { children: React.ReactNode }) {
  const t = await getT();
  return (
    <>
      <header className="site-nav no-print">
        <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" /><Wordmark /></Link>
        <span className="nav-actions"><LanguageMenu /><ThemeToggle /><Link href="/app" className="btn btn-ghost btn-sm">{t("Open my account")}</Link></span>
      </header>
      <main className="public-main">{children}</main>
      <footer className="site-footer no-print"><div className="wrap"><span>{t("Money on NEAR, private when you want it.")}</span><nav aria-label="Footer"><Link href="/roadmap">{t("Roadmap")}</Link><Link href="/whitepaper">{t("Whitepaper")}</Link><Link href="/verify">{t("Check a proof")}</Link></nav></div></footer>
    </>
  );
}

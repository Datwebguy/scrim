import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageMenu } from "@/i18n/I18n";
import { Wordmark } from "@/components/Wordmark";

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-nav no-print">
        <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" /><Wordmark /></Link>
        <span className="nav-actions"><LanguageMenu /><ThemeToggle /><Link href="/app" className="btn btn-ghost btn-sm">Open my account</Link></span>
      </header>
      <main className="public-main">{children}</main>
      <footer className="site-footer no-print"><div className="wrap"><span>Money on NEAR, private when you want it.</span><nav aria-label="Footer"><Link href="/roadmap">Roadmap</Link><Link href="/whitepaper">Whitepaper</Link><Link href="/verify">Check a proof</Link></nav></div></footer>
    </>
  );
}

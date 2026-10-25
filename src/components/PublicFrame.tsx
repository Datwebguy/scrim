import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Wordmark } from "@/components/Wordmark";

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" /><Wordmark /></Link>
        <span className="nav-actions"><ThemeToggle /><Link href="/app" className="btn btn-ghost btn-sm">Open my account</Link></span>
      </header>
      <main className="public-main">{children}</main>
      <footer className="site-footer"><div className="wrap"><span>Private money for people and businesses.</span></div></footer>
    </>
  );
}

import Link from "next/link";

export function PublicFrame({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="site-nav">
        <Link href="/" className="brand"><img src="/scrim-mark.png" alt="" />scrim</Link>
        <Link href="/app" className="btn btn-ghost btn-sm">Open my account</Link>
      </header>
      <main className="public-main">{children}</main>
      <footer className="site-footer"><div className="wrap"><span>Private money for people and businesses.</span></div></footer>
    </>
  );
}

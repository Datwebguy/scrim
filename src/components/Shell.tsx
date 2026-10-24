"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { signOutWallet } from "@/client/wallet";
import { CreateTreasuryForm } from "./CreateTreasury";
import { Initials, Modal, ToastProvider } from "./ui";

export type ShellTreasury = { id: string; name: string; kind: string; thresholdRequired: number; signerCount: number; pending: number };

export function Shell({ accountId, network, treasuries, children }: { accountId: string; network: string; treasuries: ShellTreasury[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function signOut() {
    await signOutWallet();
    router.push("/app");
    router.refresh();
  }

  return (
    <ToastProvider>
      <div className="ws">
        <aside className={`ws-side ${open ? "open" : ""}`}>
          <Link href="/" className="brand">
            <img src="/scrim-mark.png" alt="" />
            scrim
          </Link>
          <span className="label">Treasuries</span>
          {treasuries.map((t) => (
            <Link key={t.id} href={`/app/t/${t.id}`} className={`ws-link ${pathname === `/app/t/${t.id}` ? "active" : ""}`} onClick={() => setOpen(false)}>
              <span>
                {t.name}
                <br />
                <small>
                  {t.kind === "team" ? `${t.thresholdRequired} of ${t.signerCount} signers` : "Individual · 1 of 1"}
                </small>
              </span>
              {t.pending > 0 && <span className="count" title="Awaiting approval">{t.pending}</span>}
            </Link>
          ))}
          <button className="ws-new" onClick={() => setCreating(true)}>
            + New treasury
          </button>
          <span className="label">Resources</span>
          <a className="ws-link" href="https://github.com/Datwebguy/scrim/blob/main/BACKEND_SPEC.md" target="_blank" rel="noreferrer">
            Specification <small>↗</small>
          </a>
          <a className="ws-link" href="/api/health" target="_blank">
            System status <small>↗</small>
          </a>
          <div className="ws-account">
            <div className="who">
              <Initials name={accountId} className="avatar" />
              <div style={{ minWidth: 0 }}>
                <b title={accountId}>{accountId}</b>
                <small>NEAR {network}</small>
              </div>
            </div>
            <button onClick={signOut}>Sign out</button>
          </div>
        </aside>
        <div className="ws-main">
          <div className="ws-top">
            <Link href="/" className="brand">
              <img src="/scrim-mark.png" alt="" style={{ width: 24, height: 24 }} />
              scrim
            </Link>
            <button onClick={() => setOpen((v) => !v)} aria-expanded={open}>
              {open ? "Close" : "Menu"}
            </button>
          </div>
          <div className="ws-body">{children}</div>
        </div>
      </div>
      <Modal open={creating} onClose={() => setCreating(false)} eyebrow="New treasury" title="Set up a treasury">
        <CreateTreasuryForm compact onCreated={() => setCreating(false)} />
      </Modal>
    </ToastProvider>
  );
}

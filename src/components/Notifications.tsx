"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApi } from "@/client/use-api";
import type { Notice } from "@/server/notifications";

// A small bell. A number shows when something is waiting for you; tap it to see what and where.
export function Notifications() {
  const { data } = useApi<{ notices: Notice[] }>("/notifications", { every: 30_000 });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  const items = data?.notices ?? [];

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <span className="bell-wrap" ref={box}>
      <button type="button" className="bell" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={items.length ? `${items.length} waiting for you` : "Nothing waiting for you"} title="Notifications">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>
        {items.length > 0 && <span className="bell-badge">{items.length}</span>}
      </button>
      {open && (
        <div className="bell-pop" role="menu">
          {items.length === 0 ? <p className="bell-empty">Nothing waiting for you.</p> : items.map((n) => (
            <Link key={n.id} href={n.href} className="bell-item" role="menuitem" onClick={() => setOpen(false)}>{n.text}</Link>
          ))}
        </div>
      )}
    </span>
  );
}

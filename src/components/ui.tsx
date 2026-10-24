"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { STATUS_LABEL } from "@/client/format";

type Toast = { message: string; tone: "ok" | "error" } | null;
const ToastContext = createContext<(message: string, tone?: "ok" | "error") => void>(() => {});

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((message: string, tone: "ok" | "error" = "ok") => {
    clearTimeout(timer.current);
    setToast({ message, tone });
    timer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div className={`toast ${toast.tone === "error" ? "error" : ""}`} role="status" aria-live="polite">
          {toast.tone === "error" ? "×" : "✓"} {toast.message}
        </div>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function Modal({ open, onClose, eyebrow, title, children, footer }: { open: boolean; onClose: () => void; eyebrow: string; title: string; children: React.ReactNode; footer?: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="modal" onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <div className="modal-head">
            <div>
              <span className="eyebrow">{eyebrow}</span>
              <h2>{title}</h2>
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
          <div className="modal-body">{children}</div>
          {footer && <div className="modal-foot">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

const STATUS_TONE: Record<string, string> = {
  policy_rejected: "pill-red",
  awaiting_approval: "pill-amber",
  approved: "pill-blue",
  quoted: "pill-orange",
  submitting: "pill-blue",
  settled: "pill-green",
  failed: "pill-red",
  expired: "",
  cancelled: "",
};

export function StatusPill({ status }: { status: string }) {
  return <span className={`pill ${STATUS_TONE[status] ?? ""}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export function Initials({ name, className = "" }: { name: string; className?: string }) {
  const parts = name.replace(/\.(testnet|near)$/, "").split(/[\s._-]+/).filter(Boolean);
  const text = (parts.length > 1 ? parts[0][0] + parts[1][0] : name.slice(0, 2)).toUpperCase();
  return <span className={className}>{text}</span>;
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function newIdempotencyKey(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

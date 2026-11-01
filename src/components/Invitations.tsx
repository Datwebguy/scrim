"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { short } from "@/client/format";
import type { Invitation } from "@/server/treasuries";
import { Spinner, useToast } from "./ui";
import { useT } from "@/i18n/I18n";

// Someone added you to their account. You become an approver only if you say yes.
export function Invitations() {
  const t = useT();
  const { data, reload } = useApi<{ invitations: Invitation[] }>("/invitations", { every: 30_000 });
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const invitations = data?.invitations ?? [];
  if (invitations.length === 0) return null;

  async function answer(id: string, accept: boolean) {
    setBusy(id);
    try {
      await api(`/invitations/${id}`, { body: { accept } });
      toast(accept ? "You joined the account" : "Invitation declined");
      await reload();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "That didn't go through. Try again.", "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 24 }}>
      {invitations.map((i) => (
        <div key={i.treasuryId} className="card card-pad" role="group" aria-label={`Invitation to ${i.name}`}>
          <h3 style={{ marginBottom: 6 }}>{short(i.invitedBy, 8, 4)} invited you to “{i.name}”</h3>
          <p className="muted" style={{ marginBottom: 14 }}>{t("Join to approve its payments. You can say no.")}</p>
          <div className="gate-actions">
            <button className="btn btn-primary" onClick={() => answer(i.treasuryId, true)} disabled={busy !== null}>{busy === i.treasuryId && <Spinner />} Join</button>
            <button className="btn btn-ghost" onClick={() => answer(i.treasuryId, false)} disabled={busy !== null}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}

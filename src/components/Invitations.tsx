"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import type { Invitation } from "@/server/treasuries";
import { Spinner, useToast } from "./ui";

// Someone added you to their account. You become an approver only if you say yes.
export function Invitations() {
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
          <h3 style={{ marginBottom: 6 }}>{i.invitedBy} added you to “{i.name}”</h3>
          <p className="muted" style={{ marginBottom: 14 }}>
            If you join, you can see this account and approve its payments with your wallet. It needs {i.thresholdRequired} of {i.people} approvals. You can decline, and nothing changes for you.
          </p>
          <div className="gate-actions">
            <button className="btn btn-primary" onClick={() => answer(i.treasuryId, true)} disabled={busy !== null}>{busy === i.treasuryId && <Spinner />} Join</button>
            <button className="btn btn-ghost" onClick={() => answer(i.treasuryId, false)} disabled={busy !== null}>Decline</button>
          </div>
        </div>
      ))}
    </div>
  );
}

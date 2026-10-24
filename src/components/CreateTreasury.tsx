"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/client/api";
import type { Treasury } from "@/server/treasuries";
import { Spinner } from "./ui";

export function CreateTreasuryForm({ onCreated, compact = false }: { onCreated?: () => void; compact?: boolean }) {
  const router = useRouter();
  const [kind, setKind] = useState<"individual" | "team">("individual");
  const [name, setName] = useState("");
  const [signers, setSigners] = useState("");
  const [threshold, setThreshold] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const signerList = signers.split(/[\s,]+/).filter(Boolean);
  const total = signerList.length + 1;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { treasury } = await api<{ treasury: Treasury }>("/treasuries", {
        body: { name, kind, signers: signerList, threshold: kind === "team" ? Math.min(threshold, total) : 1 },
      });
      onCreated?.();
      router.push(`/app/team/${treasury.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the account.");
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="segmented" role="radiogroup" aria-label="Account type">
        <label>
          <input type="radio" name="kind" checked={kind === "individual"} onChange={() => setKind("individual")} />
          <b>Just me</b>
          <span>You approve every payment yourself.</span>
        </label>
        <label>
          <input type="radio" name="kind" checked={kind === "team"} onChange={() => setKind("team")} />
          <b>Team</b>
          <span>Several people approve together.</span>
        </label>
      </div>
      <label className="field">
        Account name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "team" ? "Studio operations" : "Personal"} maxLength={80} required />
      </label>
      {kind === "team" && (
        <>
          <label className="field">
            The other people who approve
            <small>Their NEAR accounts, separated by commas or spaces. You are added as the owner.</small>
            <textarea className="textarea mono" rows={2} value={signers} onChange={(e) => setSigners(e.target.value)} placeholder="cfo.near, ops-lead.near" />
          </label>
          <label className="field">
            How many must approve
            <select className="select" value={Math.min(threshold, total)} onChange={(e) => setThreshold(Number(e.target.value))}>
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} of {total} people
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className={`btn btn-primary ${compact ? "" : "btn-lg"}`} disabled={busy}>
        {busy && <Spinner />} Create account
      </button>
    </form>
  );
}

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
      router.push(`/app/t/${treasury.id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the treasury.");
      setBusy(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <div className="segmented" role="radiogroup" aria-label="Treasury type">
        <label>
          <input type="radio" name="kind" checked={kind === "individual"} onChange={() => setKind("individual")} />
          <b>Individual</b>
          <span>You approve alone. 1-of-1.</span>
        </label>
        <label>
          <input type="radio" name="kind" checked={kind === "team"} onChange={() => setKind("team")} />
          <b>Team</b>
          <span>Several signers. M-of-N approval.</span>
        </label>
      </div>
      <label className="field">
        Treasury name
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "team" ? "Operations" : "Personal"} maxLength={80} required />
      </label>
      {kind === "team" && (
        <>
          <label className="field">
            Other signers
            <small>NEAR account IDs, separated by commas or spaces. You are added as owner.</small>
            <textarea className="textarea mono" rows={2} value={signers} onChange={(e) => setSigners(e.target.value)} placeholder="cfo.near, ops-lead.near" />
          </label>
          <label className="field">
            Approvals required
            <select className="select" value={Math.min(threshold, total)} onChange={(e) => setThreshold(Number(e.target.value))}>
              {Array.from({ length: total }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} of {total} signers
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className={`btn btn-primary ${compact ? "" : "btn-lg"}`} disabled={busy}>
        {busy && <Spinner />} Create treasury
      </button>
    </form>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api } from "@/client/api";
import { checkProof, describeClaim, PROOF_PREFIX, type ProofCheck } from "@/protocol/proof";

type Result = { check: ProofCheck; revoked: boolean | null };
const fromB64u = (t: string) => Uint8Array.from(atob(t.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export function VerifyPage() {
  const [text, setText] = useState("");
  const [viewer, setViewer] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(token: string, who: string) {
    setBusy(true);
    setError("");
    try {
      const { publicKey } = await api<{ publicKey: string }>("/proofs/key");
      const check = checkProof(token, fromB64u(publicKey), { viewer: who });
      let revoked: boolean | null = null;
      if (check.ok) {
        try { revoked = (await api<{ revoked: boolean }>(`/proofs/state/${check.payload.id}`)).revoked; } catch { revoked = null; }
      }
      setResult({ check, revoked });
    } catch {
      setError("Couldn't check this right now. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const hash = decodeURIComponent(window.location.hash.slice(1));
    if (hash.startsWith(PROOF_PREFIX)) { setText(hash); run(hash, ""); }
  }, []);

  const c = result?.check;
  const verified = c?.ok && !c.expired && result?.revoked === false && c.readerMatches !== false;

  return (
    <div className="narrow">
      <div className="card card-pad form-grid">
        <div>
          <span className="eyebrow">Check a proof</span>
          <h1 style={{ marginTop: 10 }}>Is this proof real?</h1>
          <p className="muted" style={{ marginTop: 6 }}>Someone sent you a proof from Scrim. Paste it here to see what it says and whether it still holds. You don't need an account.</p>
        </div>
        <form className="form-grid" onSubmit={(e) => { e.preventDefault(); run(text.trim(), viewer); }}>
          <label className="field">The proof<textarea className="textarea mono" rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="scrimproof1.…" spellCheck={false} required /></label>
          <label className="field">Your name <small>Optional. We'll check the proof was made for you.</small><input className="input" value={viewer} onChange={(e) => setViewer(e.target.value)} placeholder="The name the sender used for you" /></label>
          <button className="btn btn-primary" disabled={busy}>Check proof</button>
        </form>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>

      {c && (
        <div className="card card-pad form-grid" style={{ marginTop: 16 }} aria-live="polite">
          {!c.ok ? (
            <>
              <div className="verdict bad">✕ Not valid</div>
              <p>{c.reason === "signature" ? "This proof has been changed, or it didn't come from Scrim. Don't rely on it." : c.reason === "version" ? "This proof uses a format we don't recognise." : "That doesn't look like a Scrim proof."}</p>
            </>
          ) : (
            <>
              <div className={`verdict ${verified ? "good" : "bad"}`}>{verified ? "✓ Valid" : "✕ Not valid right now"}</div>
              <p style={{ fontSize: 18 }}>{c.payload.holder ? <b>{c.payload.holder}</b> : "The sender"} {describeClaim(c.payload.claim)}.</p>
              <ul className="checks-list">
                <li className="ok">The signature is genuine and nothing was changed.</li>
                <li className={c.readerMatches === false ? "no" : "ok"}>Made for <b>{c.payload.reader}</b>.{c.readerMatches === false && " That isn't the name you entered."}{c.readerMatches === null && " Enter your name above to check it's you."}</li>
                <li className={c.expired ? "no" : "ok"}>{c.expired ? "Expired" : "Valid until"} {new Date(c.payload.expiresAt).toLocaleString()}.</li>
                <li className={result?.revoked ? "no" : result?.revoked === false ? "ok" : "warn"}>{result?.revoked ? "The sender has taken this proof back." : result?.revoked === false ? "Not taken back by the sender." : "Couldn't check whether the sender took it back."}</li>
              </ul>
              <div className="notice info">Scrim checked the sender's private balance on {new Date(c.payload.issuedAt).toLocaleDateString()} and vouches for this statement. It shows one fact and nothing else about their money. A proof can be forwarded, which is why it names who it's for.</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

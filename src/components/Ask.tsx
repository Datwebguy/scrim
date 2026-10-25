"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { Heading } from "./money";
import { Spinner } from "./ui";

type Answer = {
  answer: string;
  model: string;
  verification: { signed: boolean; attested: boolean; signingAddress: string | null; chatId: string; detail: string };
};

const SUGGESTIONS = ["How much did I send this month?", "Which payments are waiting for approval?", "What did my agents ask to pay, and what was stopped?", "What do I hold right now?"];

// Questions about your own money, answered privately inside NEAR AI's secure hardware.
export function Ask() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ question: string; answer: Answer } | null>(null);

  async function submit(q: string) {
    if (!q.trim()) return;
    setBusy(true);
    setError("");
    try {
      setResult({ question: q, answer: await api<Answer>("/ask", { method: "POST", body: { question: q } }) });
      setQuestion("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const v = result?.answer.verification;
  return (
    <div className="narrow">
      <Heading eyebrow="Ask" title="Ask about your money" text="Answered by AI running inside NEAR AI's secure hardware. Your records go only there, for this answer, and Scrim keeps no copy." />
      <form className="card card-pad form-grid" onSubmit={(e) => { e.preventDefault(); void submit(question); }}>
        <label className="field">
          Your question
          <input className="input" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="How much did we pay suppliers last week?" maxLength={500} disabled={busy} />
        </label>
        <div className="chips">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip" disabled={busy} onClick={() => void submit(s)}>{s}</button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={busy || !question.trim()}>{busy ? <><Spinner /> Thinking privately…</> : "Ask"}</button>
        {error && <div className="notice danger">{error}</div>}
      </form>

      {result && v && (
        <div className="card card-pad form-grid" style={{ marginTop: 16 }}>
          <span className="section-label">{result.question}</span>
          <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{result.answer.answer}</p>
          <div className={`notice ${v.attested ? "good" : "info"}`}>
            <b>{v.attested ? "Verified private answer" : v.signed ? "Signed answer" : "Answer not verified"}</b>
            <span style={{ display: "block" }}>{v.detail}</span>
          </div>
          <details>
            <summary className="muted">Verification details</summary>
            <dl className="details">
              <dt>Model</dt><dd className="mono">{result.answer.model}</dd>
              <dt>Answer ID</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{v.chatId}</dd>
              {v.signingAddress && <><dt>Signed by</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{v.signingAddress}</dd></>}
            </dl>
            <a className="btn btn-ghost btn-sm" href="https://docs.near.ai/cloud/verification" target="_blank" rel="noreferrer">How NEAR AI verification works ↗</a>
          </details>
        </div>
      )}
    </div>
  );
}

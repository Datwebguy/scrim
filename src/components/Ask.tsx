"use client";
import { useState } from "react";
import { api } from "@/client/api";
import { useApi } from "@/client/use-api";
import { sendToken, signTransfer } from "@/client/wallet";
import type { TransferView } from "./money";
import { useSession } from "./session";
import { Heading } from "./money";
import { Spinner } from "./ui";

type Account = { freeLeft: number; creditUsd: number; priceUsd: number; questionsLeft: number; canTopUp: boolean; walletPay: { to: string; token: string } | null };
const TOP_UPS = [1, 5, 20];
const cents = (usd: number) => (usd < 1 ? `${Math.round(usd * 100)} cents` : `$${usd.toFixed(2)}`);

type Answer = {
  account: Account;
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
  const { network, accountId } = useSession();
  const { data: fetched, reload } = useApi<Account>("/ask");
  const account = result?.answer.account ?? fetched;
  const left = account?.questionsLeft;
  const [paying, setPaying] = useState(0);
  const [payFrom, setPayFrom] = useState<"private" | "wallet">("private");

  // Buying more questions: one transfer, from the private balance or straight from the wallet, approved once.
  async function topUp(dollars: number) {
    setPaying(dollars);
    setError("");
    try {
      if (payFrom === "wallet" && account?.walletPay) {
        const txHash = await sendToken(network, account.walletPay.token, account.walletPay.to, String(dollars * 1_000_000));
        let credited: Account | null = null;
        for (let i = 0; i < 10 && !credited; i++) {
          try { credited = (await api<{ account: Account }>("/ask/top-up/wallet", { body: { txHash } })).account; }
          catch (e) { if (i === 9) throw e; await new Promise((r) => setTimeout(r, 3000)); }
        }
        setResult(null);
        reload();
        return;
      }
      let { transfer } = await api<{ transfer: TransferView }>("/ask/top-up", { body: { dollars } });
      if (transfer.intentToSign) transfer = (await api<{ transfer: TransferView }>(`/transfers/${transfer.id}/sign`, { body: await signTransfer(network, transfer.intentToSign, accountId) })).transfer;
      for (let i = 0; i < 40 && !["success", "failed", "refunded", "expired"].includes(transfer.status); i++) {
        await new Promise((r) => setTimeout(r, 3000));
        transfer = (await api<{ transfer: TransferView }>(`/transfers/${transfer.id}`)).transfer;
      }
      if (transfer.status !== "success") throw new Error(transfer.status === "processing" || transfer.status === "awaiting_signature" ? "It's still on its way. Your questions appear here when it arrives." : "The payment didn't go through. Nothing was taken.");
      setResult(null);
      reload();
    } catch (e) {
      setError((e as Error).message);
      reload();
    } finally {
      setPaying(0);
    }
  }

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
        <div className="between">
          <button className="btn btn-primary" disabled={busy || !question.trim() || left === 0}>{busy ? <><Spinner /> Thinking privately…</> : "Ask"}</button>
          {account && <small className="muted">{account.freeLeft ? "Your first question is free." : `${left} question${left === 1 ? "" : "s"} left${account.creditUsd ? ` ($${account.creditUsd.toFixed(2)})` : ""}`}</small>}
        </div>
        {account && account.freeLeft === 0 && (
          <div className="form-grid">
            <small className="muted">Questions cost {cents(account.priceUsd)} each, paid with your own USDC. You approve once, then ask as many as you bought. Unused questions never expire.</small>
            {account.canTopUp && account.walletPay && (
              <div className="segmented" role="radiogroup" aria-label="Pay from">
                <button type="button" role="radio" aria-checked={payFrom === "private"} onClick={() => setPayFrom("private")}>Private balance</button>
                <button type="button" role="radio" aria-checked={payFrom === "wallet"} onClick={() => setPayFrom("wallet")}>My wallet</button>
              </div>
            )}
            {account.canTopUp ? (
              <div className="chips">
                {TOP_UPS.map((d) => (
                  <button key={d} type="button" className="chip" disabled={paying > 0} onClick={() => void topUp(d)}>
                    {paying === d ? <Spinner /> : `Add $${d} · ${Math.floor(d / account.priceUsd)} questions`}
                  </button>
                ))}
              </div>
            ) : (
              <small className="muted">{network === "testnet" ? "On mainnet you can add more questions with USDC." : "Adding questions isn't switched on for this site yet."}</small>
            )}
          </div>
        )}
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

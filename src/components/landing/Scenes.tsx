"use client";
import { useEffect, useRef, useState } from "react";

export type Coin = { symbol: string; icon: string | null };
export type Net = { name: string; icon: string | null };

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Steps through `count` stages on a loop, only while the scene is on screen.
function useLoop(count: number, ms: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(count - 1);
  useEffect(() => {
    const node = ref.current;
    if (!node || reduced()) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearInterval(timer);
      if (entry.isIntersecting) {
        setStep(0);
        timer = setInterval(() => setStep((s) => (s + 1) % count), ms);
      }
    }, { threshold: 0.3 });
    observer.observe(node);
    return () => { observer.disconnect(); clearInterval(timer); };
  }, [count, ms]);
  return { ref, step };
}

const Logo = ({ item, size = 28 }: { item: { icon: string | null; symbol?: string; name?: string } | undefined; size?: number }) =>
  item?.icon
    ? <img className="sc-logo" src={item.icon} alt="" width={size} height={size} referrerPolicy="no-referrer" />
    : <span className="sc-logo blank" style={{ width: size, height: size }}>{(item?.symbol ?? item?.name ?? "").slice(0, 1)}</span>;

/* Hero: what you see versus what the public sees, flipping back and forth. */
export function HeroCard({ coins }: { coins: Coin[] }) {
  const { ref, step } = useLoop(2, 3200);
  const publicView = step === 1;
  return (
    <div ref={ref} className={`sc-hero ${publicView ? "is-public" : ""}`}>
      <div className="sc-hero-top">
        <span className={!publicView ? "on" : ""}>Your view</span>
        <span className={publicView ? "on" : ""}>Public view</span>
      </div>
      <ul>
        {coins.slice(0, 4).map((c, i) => (
          <li key={c.symbol} style={{ transitionDelay: `${i * 70}ms` }}>
            <Logo item={c} />
            <b>{c.symbol}</b>
            <span className="sc-bar" style={{ width: `${70 - i * 12}%` }} />
          </li>
        ))}
      </ul>
      <div className="sc-hero-foot">{publicView ? "Private: nothing to see" : "Private: only you can see this"}</div>
    </div>
  );
}

/* Send: pick a network, send, done. */
export function SendScene({ nets }: { nets: Net[] }) {
  const { ref, step } = useLoop(4, 1500);
  const [n, setN] = useState(0);
  useEffect(() => { if (step === 0) setN((x) => x + 1); }, [step]);
  const net = nets.length ? nets[n % nets.length] : undefined;
  return (
    <div ref={ref} className="sc-card">
      <label className="sc-label">To</label>
      <div className={`sc-input ${step >= 1 ? "filled" : ""}`}><span className="sc-type">Any address</span></div>
      <label className="sc-label">Network</label>
      <div className="sc-input sc-net"><Logo item={net} size={22} /><b key={n}>{net?.name ?? "Any chain"}</b></div>
      <div className={`sc-btn ${step === 2 ? "press" : ""} ${step === 3 ? "done" : ""}`}>
        {step === 3 ? "✓ Sent" : "Send"}
      </div>
    </div>
  );
}

/* Swap: two real coins trade places inside the balance. */
export function SwapScene({ coins }: { coins: Coin[] }) {
  const { ref, step } = useLoop(Math.max(coins.length, 2), 2000);
  const a = coins[step % coins.length];
  const b = coins[(step + 1) % coins.length];
  return (
    <div ref={ref} className="sc-card sc-swap">
      <div className="sc-swap-row" key={`a${step}`}><Logo item={a} size={36} /><b>{a?.symbol}</b><small>You pay</small></div>
      <div className="sc-swap-mid"><span key={step}>⇅</span></div>
      <div className="sc-swap-row in" key={`b${step}`}><Logo item={b} size={36} /><b>{b?.symbol}</b><small>You get</small></div>
      <div className="sc-hidden">Private when you choose</div>
    </div>
  );
}

/* Get paid: a link goes out, a payer on some chain pays, it arrives. */
export function PaidScene({ nets }: { nets: Net[] }) {
  const { ref, step } = useLoop(4, 1400);
  const [n, setN] = useState(0);
  useEffect(() => { if (step === 0) setN((x) => x + 1); }, [step]);
  const net = nets.length ? nets[n % nets.length] : undefined;
  return (
    <div ref={ref} className="sc-card sc-paid">
      <div className={`sc-link ${step >= 1 ? "copied" : ""}`}><svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></svg><b>Your payment link</b><em>{step >= 1 ? "Copied" : "Copy"}</em></div>
      <div className={`sc-payer ${step >= 2 ? "show" : ""}`}><Logo item={net} size={26} /><span>Payer on <b>{net?.name ?? "any chain"}</b></span></div>
      <div className={`sc-arrive ${step >= 3 ? "show" : ""}`}>✓ Received where you chose</div>
    </div>
  );
}

/* Accounts with rules: a request moves through limits and approvals. */
export function TeamScene() {
  const steps = ["Request", "Limits check", "Approvals", "Paid & recorded"];
  const { ref, step } = useLoop(steps.length + 1, 1200);
  return (
    <div ref={ref} className="sc-team">
      {steps.map((s, i) => (
        <div key={s} className={`sc-team-step ${i < step ? "done" : ""} ${i === step ? "now" : ""}`}>
          <i>{i < step ? "✓" : i + 1}</i><b>{s}</b>
          {i === 2 && <span className="sc-approvers">{[0, 1, 2].map((k) => <em key={k} className={step > 2 || (step === 2 && k < 2) ? "ok" : ""} />)}</span>}
        </div>
      ))}
    </div>
  );
}

/* Proofs: checks tick one by one, then the proof is stamped valid. */
export function ProofScene() {
  const rows = ["Made for one named reader", "Holds at least an amount", "Valid for 1, 7 or 30 days"];
  const { ref, step } = useLoop(rows.length + 3, 900);
  return (
    <div ref={ref} className="sc-card sc-proof">
      {rows.map((r, i) => <div key={r} className={`sc-check ${step > i ? "on" : ""}`}><span>✓</span>{r}</div>)}
      <div className={`sc-check no ${step > rows.length ? "on" : ""}`}><span>✕</span>Balance and history stay yours</div>
      <div className={`sc-stamp ${step > rows.length + 1 ? "on" : ""}`}>Valid</div>
    </div>
  );
}

/* Agents: software asks to pay, its limits check every request, people approve, anything outside the limits is stopped. */
export function AgentScene() {
  const requests = [
    { label: "Within limits", ok: true },
    { label: "Over the daily limit", ok: false },
    { label: "Recipient not on the list", ok: false },
  ];
  const { ref, step } = useLoop(requests.length * 3, 900);
  const r = requests[Math.floor(step / 3)];
  const phase = step % 3; // 0 asks, 1 checked, 2 result
  return (
    <div ref={ref} className="sc-card sc-agent">
      <div className="sc-agent-head"><span className="sc-agent-bot" aria-hidden="true">⌘</span><b>Agent</b><em className={phase === 0 ? "on" : ""}>Asks to pay</em></div>
      <div className="sc-agent-limits">
        <span className={phase >= 1 ? (r.ok || r.label !== "Over the daily limit" ? "pass" : "fail") : ""}>Daily limit</span>
        <span className={phase >= 1 ? "pass" : ""}>Per payment</span>
        <span className={phase >= 1 ? (r.ok || r.label !== "Recipient not on the list" ? "pass" : "fail") : ""}>Allowed recipients</span>
      </div>
      <div className={`sc-agent-out ${phase === 2 ? (r.ok ? "ok" : "stop") : ""}`} key={step}>
        {phase < 2 ? r.label : r.ok ? "✓ Sent to you to approve" : "✕ Stopped before anyone sees it"}
      </div>
    </div>
  );
}

/* x402: an agent calls a paid API, gets "402 Payment Required", Scrim checks its limits, pays privately, and the API answers. */
export function X402Scene() {
  const steps = [
    { from: "agent", text: "Finds a paid API and asks for data" },
    { from: "api", text: "402 · Payment required" },
    { from: "scrim", text: "Within the agent's limits" },
    { from: "scrim", text: "Paid on Base, Solana or another chain" },
    { from: "api", text: "200 · Here is your data" },
  ];
  const { ref, step } = useLoop(steps.length + 2, 1000);
  return (
    <div ref={ref} className="sc-card sc-x402">
      <div className="sc-x402-ends"><span>Agent</span><i aria-hidden="true" /><span>Paid API</span></div>
      <ol>
        {steps.map((s, i) => (
          <li key={s.text} className={`by-${s.from} ${step >= i ? "on" : ""} ${step === i ? "now" : ""}`}>
            <b>{s.from === "agent" ? "Agent" : s.from === "api" ? "API" : "Scrim"}</b>{s.text}
          </li>
        ))}
      </ol>
      <div className={`sc-x402-foot ${step >= steps.length - 1 ? "on" : ""}`}>The API never sees whose money paid it.</div>
    </div>
  );
}

/* Ask: a question goes into secure hardware with your records, an answer comes out, its signature is checked. */
export function AskScene() {
  const steps = ["Your records, sealed", "Answered inside secure hardware", "Signature checked"];
  const { ref, step } = useLoop(steps.length + 3, 1000);
  return (
    <div ref={ref} className="sc-card sc-ask">
      <div className={`sc-ask-q ${step >= 0 ? "on" : ""}`}>What did we pay suppliers this month?</div>
      <div className={`sc-ask-box ${step >= 1 && step <= 2 ? "busy" : ""}`} aria-hidden="true">
        <span className="sc-ask-lock">⬡</span>
        <b>NEAR AI · secure hardware</b>
      </div>
      <ol>
        {steps.map((s, i) => <li key={s} className={step > i ? "on" : ""}><span>✓</span>{s}</li>)}
      </ol>
      <div className={`sc-stamp ${step > steps.length ? "on" : ""}`}>Verified</div>
    </div>
  );
}

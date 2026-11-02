"use client";
import { useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/I18n";
import { StatusMark } from "@/components/StatusMark";
import { ClaudeMark, CursorMark, GeminiMark, OpenAIMark } from "./AgentMarks";

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
      <div className={`sc-link ${step >= 1 ? "copied" : ""}`}><span>🔗</span><b>Your payment link</b><em>{step >= 1 ? "Copied" : "Copy"}</em></div>
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
  const t = useT();
  const agents = [
    { name: "Claude Code", Mark: ClaudeMark, ask: "{agent} asks to pay a vendor", check: "Inside its limits", pill: "Inside limits", result: "Paid", end: "ok" as const },
    { name: "Codex", Mark: OpenAIMark, ask: "{agent} asks to pay over its per payment limit", check: "Waiting for you", pill: "Waits for you", result: "Approved by you", end: "wait" as const },
    { name: "Cursor", Mark: CursorMark, ask: "{agent} asks to pay someone not on its list", check: "Not on the allowed list", pill: "Refused", result: "Stopped", end: "no" as const },
    { name: "Gemini CLI", Mark: GeminiMark, ask: "{agent} asks to pay a vendor", check: "Inside its limits", pill: "Inside limits", result: "Paid", end: "ok" as const },
  ];
  const { ref, step } = useLoop(agents.length * 4, 1100);
  const index = Math.floor(step / 4);
  const phase = step % 4; // 0 asks, 1 checked, 2 result, 3 holds
  const a = agents[index];
  const refused = a.end === "no";
  const line = phase === 0 ? t(a.ask, { agent: a.name }) : a.name;
  const sub = phase === 0 ? t("Scrim checks the rules") : phase === 1 ? t(a.check) : t(a.result);
  const pill = phase === 0 ? { cls: "idle", text: t("Checking") } : phase === 1 ? { cls: a.end, text: t(a.pill) } : refused ? { cls: "no", text: t("Stopped") } : { cls: "ok", text: t("Done") };
  return (
    <div ref={ref} className="sc-card sc-agent">
      <div className="sc-agent-chips">
        {agents.map(({ name, Mark }, i) => <div key={name} className={i === index ? "on" : ""}><span className="sc-agent-logo"><Mark /></span><span>{name}</span></div>)}
      </div>
      <svg className="sc-agent-rail" key={index} viewBox="0 0 400 44" preserveAspectRatio="none" aria-hidden="true">
        <defs><linearGradient id="agent-rail-light" x1="0" x2="1"><stop offset="0" stopColor="#ff5b2d" stopOpacity="0" /><stop offset="1" stopColor="#ff5b2d" /></linearGradient></defs>
        <path className="base" d={`M${50 + index * 100} 0V22H200V44`} />
        <path className="lit" d={`M${50 + index * 100} 0V22H200V44`} stroke="url(#agent-rail-light)" />
      </svg>
      <div className="sc-agent-req" aria-live="polite">
        <StatusMark key={step} state={phase === 2 && !refused ? "done" : "moving"} size={40} className={phase === 2 && refused ? "is-off" : ""} />
        <div className="sc-agent-text" key={`t${step}`}><b>{line}</b><span>{sub}</span></div>
        <span className={`sc-agent-pill ${pill.cls}`}>{pill.text}</span>
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

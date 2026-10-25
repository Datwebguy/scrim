"use client";
import { useEffect, useState } from "react";

export type DemoIcon = { name: string; icon: string | null };

type Scene = { id: string; tab: string; from: string; via: string; to: string; line: string; fromCycle?: boolean; toCycle?: boolean };

const SCENES: Scene[] = [
  { id: "add", tab: "Add", from: "Any chain", via: "One-time address", to: "Your balance", line: "Money lands where you choose.", fromCycle: true },
  { id: "send", tab: "Send", from: "Your balance", via: "Your choice", to: "Any address", line: "Choose private and it can't be traced back to you.", toCycle: true },
  { id: "swap", tab: "Swap", from: "Coin", via: "Your choice", to: "Another coin", line: "Swap in public, or privately inside your balance.", fromCycle: true, toCycle: true },
  { id: "paid", tab: "Get paid", from: "Payer, any coin", via: "Your link", to: "Your balance", line: "They pay from any chain. No account needed.", fromCycle: true },
  { id: "prove", tab: "Prove", from: "Your balance", via: "Proof for one reader", to: "Bank, landlord, client", line: "One fact. One person. It expires." },
];

const AUTOPLAY_MS = 5200;

export function FlowDemo({ icons }: { icons: DemoIcon[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tick, setTick] = useState(0);
  const scene = SCENES[index];

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % SCENES.length), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [paused]);

  // Chain logos rotate while a scene plays, so the demo shows money coming from, or going to, real networks.
  useEffect(() => {
    if (icons.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1300);
    return () => clearInterval(timer);
  }, [icons.length]);

  const iconAt = (offset: number) => (icons.length ? icons[(tick + offset) % icons.length] : null);

  const node = (label: string, cycle: boolean | undefined, offset: number, kind: "start" | "mid" | "end") => {
    const current = cycle ? iconAt(offset) : null;
    return (
      <div className={`fd-node ${kind}`}>
        <span className="fd-badge" aria-hidden="true">
          {current?.icon ? <img src={current.icon} alt="" width={28} height={28} referrerPolicy="no-referrer" /> : <i />}
        </span>
        <b>{cycle && current ? current.name : label}</b>
        {cycle && current && <small>{label}</small>}
      </div>
    );
  };

  return (
    <div className="flow-demo" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="fd-tabs" role="tablist" aria-label="What you can do">
        {SCENES.map((s, i) => (
          <button key={s.id} role="tab" aria-selected={i === index} onClick={() => { setIndex(i); setPaused(true); }}>
            {s.tab}
            {i === index && !paused && <span className="fd-progress" style={{ animationDuration: `${AUTOPLAY_MS}ms` }} />}
          </button>
        ))}
      </div>

      <div className="fd-stage" key={scene.id}>
        <div className="fd-track" aria-hidden="true">
          <span className="fd-line" />
          <span className="fd-dot" />
          <span className="fd-dot two" />
        </div>
        <div className="fd-nodes">
          {node(scene.from, scene.fromCycle, 0, "start")}
          {node(scene.via, false, 0, "mid")}
          {node(scene.to, scene.toCycle, 3, "end")}
        </div>
        <p className="fd-line-text" aria-live="polite">{scene.line}</p>
      </div>

      <div className="fd-views">
        <div className="fd-view you"><span>You see</span><b>Everything</b></div>
        <div className="fd-view them"><span>The public sees</span><b>Only what you choose</b></div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";

// A large tagline whose words light up one at a time, in reading order, as it scrolls into view.
export function TaglineReveal({ lines }: { lines: string[] }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [lit, setLit] = useState(-1);
  const words = lines.map((l) => l.split(" "));
  const total = words.flat().length;

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) { setLit(total); return; }
    let timer: ReturnType<typeof setInterval> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      let i = 0;
      timer = setInterval(() => { setLit(i++); if (i > total) clearInterval(timer); }, 110);
    }, { rootMargin: "0px 0px -25% 0px" });
    observer.observe(node);
    return () => { observer.disconnect(); if (timer) clearInterval(timer); };
  }, [total]);

  let n = 0;
  return (
    <h2 ref={ref} className="tagline-reveal">
      {words.map((line, li) => (
        <span key={li} className="tl-line">
          {line.map((w) => { const i = n++; return <span key={i} className={`tl-word ${i <= lit ? "on" : ""}`}>{w} </span>; })}
        </span>
      ))}
    </h2>
  );
}

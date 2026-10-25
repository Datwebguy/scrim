"use client";
import { useEffect, useState } from "react";
import { THEME_KEY as KEY } from "@/client/theme-script";

type Theme = "light" | "dark";

// A small round switch: the sun folds its rays and becomes a moon.
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);
  useEffect(() => { setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light"); }, []);

  function flip() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(KEY, next); } catch { /* the choice just won't be remembered */ }
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#0c0c0b" : "#151512");
    setTheme(next);
  }

  const dark = theme === "dark";
  return (
    <button type="button" className="theme-toggle" onClick={flip} aria-pressed={dark} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} title={dark ? "Light mode" : "Dark mode"}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <mask id="tt-moon">
          <rect width="24" height="24" fill="#fff" />
          <circle className="tt-shade" cx="24" cy="0" r="6" fill="#000" />
        </mask>
        <circle className="tt-core" cx="12" cy="12" r="5" mask="url(#tt-moon)" />
        <g className="tt-rays" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
            const r = (a * Math.PI) / 180;
            return <line key={a} x1={12 + Math.cos(r) * 8} y1={12 + Math.sin(r) * 8} x2={12 + Math.cos(r) * 10} y2={12 + Math.sin(r) * 10} />;
          })}
        </g>
      </svg>
    </button>
  );
}

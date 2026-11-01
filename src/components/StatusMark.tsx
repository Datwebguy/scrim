import { useId } from "react";

// The Scrim mark as a status: while money is on its way the cut travels across it; when it is done the cut draws
// once and the orange tip lights up. It plays once and stays still. Without motion it shows the finished mark.
export function StatusMark({ state, size = 16, className = "" }: { state: "moving" | "done"; size?: number; className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={`status-mark ${state} ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <clipPath id={`sm-shape-${id}`}><path d="M50 4C84 4 96 12 96 50S86 96 50 96 4 88 4 50 17 4 50 4Z" /></clipPath>
        <linearGradient id={`sm-light-${id}`} x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <path className="sm-body" d="M50 4C84 4 96 12 96 50S86 96 50 96 4 88 4 50 17 4 50 4Z" />
      <g clipPath={`url(#sm-shape-${id})`}>
        <path className="sm-streak" d="M0 61Q44 49 84 31Q47 45 0 61Z" fill={`url(#sm-light-${id})`} />
        <path className="sm-tip" d="M73 33.5Q86 28 100 21L100 30Q86 31.5 73 33.5Z" />
      </g>
    </svg>
  );
}

// The Scrim mark, drawn: a soft square, a streak of light across it and the orange tip it ends in.
// The streak draws itself in, then the tip glows. Still for people who prefer less motion.
export function MarkArt({ className = "", title }: { className?: string; title?: string }) {
  return (
    <svg className={`mark-art ${className}`} viewBox="0 0 100 100" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <defs>
        <clipPath id="mk-shape"><path d="M50 4C84 4 96 12 96 50S86 96 50 96 4 88 4 50 17 4 50 4Z" /></clipPath>
        <linearGradient id="mk-light" x1="0" x2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset=".55" stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <path className="mk-body" d="M50 4C84 4 96 12 96 50S86 96 50 96 4 88 4 50 17 4 50 4Z" />
      <g clipPath="url(#mk-shape)">
        <path className="mk-streak" d="M0 61Q44 49 84 31Q47 45 0 61Z" fill="url(#mk-light)" />
        <path className="mk-tip" d="M73 33.5Q86 28 100 21L100 30Q86 31.5 73 33.5Z" />
      </g>
    </svg>
  );
}

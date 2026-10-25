// The Scrim wordmark: SCR, a lowercase i whose dot is the orange slash from the mark, then M.
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`wordmark ${className}`} aria-label="Scrim">
      <span aria-hidden="true">SCR</span>
      <span className="wm-i" aria-hidden="true" />
      <span aria-hidden="true">M</span>
    </span>
  );
}

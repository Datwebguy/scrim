import { MarkArt } from "./MarkArt";

// Everything Scrim does, linked to the mark at the center, with the chains it pays on circling outside.
const USES = ["Private balance", "Send", "Swap", "Get paid", "Sell", "Approvals", "Agents", "x402", "Ask AI", "Proofs"];
const HOT = new Set(["Private balance", "Agents", "x402"]);

export function Orbit({ chains }: { chains: { name: string; icon: string | null }[] }) {
  const logos = chains.filter((c) => c.icon).slice(0, 16);
  return (
    <div className="orbit" role="img" aria-label={`Scrim: ${USES.join(", ")}. Pays on ${logos.map((c) => c.name).join(", ")} and more.`}>
      <span className="ob-ring ob-r0" />
      <span className="ob-ring ob-r1" />
      <span className="ob-ring ob-r2" />
      <span className="ob-trail ob-t1" />
      <span className="ob-trail ob-t2" />
      {USES.map((u, i) => (
        <span key={u} className="ob-spoke" style={{ ["--a" as string]: `${-90 + (i * 360) / USES.length}deg` }}>
          {i % 3 === 0 && <i />}
        </span>
      ))}
      <div className="ob-chains">
        {logos.map((c, i) => (
          <span key={c.name} className="ob-chain" style={{ ["--a" as string]: `${-80 + (i * 360) / logos.length}deg` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={c.icon!} alt="" loading="lazy" />
          </span>
        ))}
      </div>
      {USES.map((u, i) => (
        <span key={u} className={`ob-node${HOT.has(u) ? " hot" : ""}`} style={{ ["--a" as string]: `${-90 + (i * 360) / USES.length}deg` }}>
          <b>{u}</b>
        </span>
      ))}
      <MarkArt className="ob-mark" />
    </div>
  );
}

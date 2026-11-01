import Link from "next/link";
import { ROADMAP } from "@/content/roadmap";

const PILL = { live: "pill-green", next: "pill-orange", later: "" } as const;

export function RoadmapPage() {
  return (
    <div className="doc-page wrap">
      <header className="doc-hero">
        <span className="eyebrow">Roadmap</span>
        <h1>Where Scrim is going</h1>
        <p className="lead">
          Scrim ships in steps. Each one makes private money easier to use for people, teams and the software that pays for them. Here is what is
          live, what we are building now, and what comes after.
        </p>
      </header>

      <div className="rm-grid">
        {ROADMAP.map((stage) => (
          <section key={stage.id} className={`rm-stage rm-${stage.id}`} aria-labelledby={`rm-${stage.id}`}>
            <div className="rm-head">
              <span className={`pill ${PILL[stage.id]}`}>{stage.label}</span>
              <p id={`rm-${stage.id}`}>{stage.summary}</p>
            </div>
            <ol className="rm-list">
              {stage.items.map((item) => (
                <li key={item.title} className="card rm-item">
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <p className="doc-foot">
        The full design, privacy model and security model are in the <Link href="/whitepaper">whitepaper</Link>. Have an idea? Open an issue on{" "}
        <a href="https://github.com/Datwebguy/scrim/issues">GitHub</a>.
      </p>
    </div>
  );
}

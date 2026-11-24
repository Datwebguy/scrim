import Link from "next/link";

const apps = (url: string): [string, React.ReactNode][] => [
  ["Claude", <>Settings, Connectors, Add custom connector. Paste the address.</>],
  ["ChatGPT", <>Settings, Apps and connectors. Turn on developer mode, then create a connector with the address.</>],
  ["Claude Code", <code>claude mcp add --transport http scrim {url}</code>],
  ["Codex", <code>codex mcp add scrim --url {url}</code>],
  ["Cursor, VS Code", <>Add Scrim as a remote MCP server with the address.</>],
  ["Grok", <>Add the Scrim plugin from <a href="https://github.com/Datwebguy/scrim/tree/main/plugin">GitHub</a>.</>],
  ["Hermes Agent, bots, scripts", <>In Scrim, open your account, then Connected apps, then Make a key for an agent. The agent sends it as <code>Authorization: Bearer scrim_pk_…</code> to the address.</>],
];

const TOOLS: [string, string][] = [
  ["See your money", "Your private balance, what each coin is worth, and your recent activity."],
  ["Find coins and prices", "Any coin Scrim can hold, memes included, and the price of a swap before you make it."],
  ["Add money", "An address on another chain. Whatever you send there lands in your private balance."],
  ["Prepare a swap, a send or a withdrawal", "Your AI fills in the payment and checks the price. It waits in Scrim for you."],
];

// Public: what connecting an AI to Scrim does, how to connect each app, and how approving works.
export function AiPage({ mcpUrl }: { mcpUrl: string }) {
  return (
    <div className="doc-page wrap">
      <header className="doc-hero">
        <span className="eyebrow">Scrim for AI</span>
        <h1>Use Scrim with your AI</h1>
        <p className="lead">
          Connect your AI app to Scrim and ask about your money in plain words: what you hold, what a swap would cost, or to pay someone. Your AI
          prepares. You approve in Scrim with your own wallet. Nothing moves until you do.
        </p>
      </header>

      <section className="doc-section">
        <h2>Connect</h2>
        <p>Scrim's address for every AI app:</p>
        <p><code style={{ overflowWrap: "anywhere" }}>{mcpUrl}</code></p>
        <dl className="detail-list card card-pad">
          {apps(mcpUrl).map(([name, how]) => <div key={name}><dt>{name}</dt><dd style={{ overflowWrap: "anywhere" }}>{how}</dd></div>)}
        </dl>
        <p>
          The first time, Scrim opens and asks you to sign in (wallet, Google or email) and tap Connect. That's all. To see your private balance,
          your AI needs it unlocked, the same as in the app.
        </p>
      </section>

      <section className="doc-section">
        <h2>What your AI can do</h2>
        <dl className="detail-list card card-pad">
          {TOOLS.map(([name, what]) => <div key={name}><dt>{name}</dt><dd>{what}</dd></div>)}
        </dl>
      </section>

      <section className="doc-section">
        <h2>How approving works</h2>
        <ol>
          <li>You ask your AI, for example: "Swap 20 USDC to NEAR" or "Send 5 USDC to ada.near".</li>
          <li>It checks the price with NEAR Intents and files the payment in Scrim. It gives you a link.</li>
          <li>Open the link, or open Scrim: the payment waits on Home under Waiting for your approval.</li>
          <li>Scrim's own Send or Swap screen opens, filled in, with the app's name on it. Check who gets paid and how much, see the final price, and confirm with your wallet. Or decline.</li>
          <li>Your AI can check where it stands: waiting, done, declined or expired. A request expires after a day.</li>
        </ol>
        <p>Your AI never holds a key, can't confirm for you, and never needs your seed phrase. If it asks for one, it isn't Scrim.</p>
      </section>

      <section className="doc-section">
        <h2>Privacy</h2>
        <p>
          Swaps and sends to a .near name stay inside your private balance. A send to a 64 character NEAR address, the kind wallets and exchanges
          use, is paid out on the blockchain so it arrives there. A withdrawal to another chain is public on that chain. Your AI app sees what you
          ask it to read; Scrim doesn't read your chats.
        </p>
      </section>

      <section className="doc-section">
        <h2>Disconnect</h2>
        <p>In Scrim, open your account, then Connected apps, then Disconnect. The app loses access at once. Connections end by themselves after 30 days, and keys after 90.</p>
      </section>

      <p className="doc-foot">
        For developers: the plugin, its manifests and skills are in <a href="https://github.com/Datwebguy/scrim/tree/main/plugin">plugin/</a>, and every tool is
        listed in the <a href="https://github.com/Datwebguy/scrim/blob/main/docs/AGENTS_GUIDE.md">agents guide</a>. <Link href="/app">Open Scrim</Link>
      </p>
    </div>
  );
}

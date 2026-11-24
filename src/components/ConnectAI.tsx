"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/client/api";
import { useT } from "@/i18n/I18n";
import { CopyField } from "./money";
import { Spinner, useToast } from "./ui";

type Connector = { id: string; name: string; kind: "app" | "key"; connectedAt: string; expiresAt: string };
type Request = { name: string; params: Record<string, string | undefined>; denyUrl: string; returnsTo: string; suspicious: boolean };

// Only ever send the browser to a web address, never a script.
const safeUrl = (u: string) => { try { return ["https:", "http:"].includes(new URL(u).protocol) ? u : null; } catch { return null; } };

const CAN = ["See your private balance and recent activity", "Look up coins and price swaps", "Get an address to add money", "Prepare swaps, sends and withdrawals for you to approve"];

// One page to use Scrim from any AI app: approve an app that asked to connect, make a key for agents that
// can't sign in, see setup steps for each app, and disconnect anything.
export function ConnectAI({ mcpUrl, accountId, unlocked, request, problem }: { mcpUrl: string; accountId: string; unlocked: boolean; request: Request | null; problem: string | null }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Connector[] | null>(null);
  const [keyName, setKeyName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const load = useCallback(() => api<{ connectors: Connector[] }>("/connectors").then((r) => setList(r.connectors), () => setList([])), []);
  useEffect(() => { load(); }, [load]);

  async function allow() {
    if (!request) return;
    setBusy(true);
    try {
      const r = await api<{ redirect: string }>("/connectors/authorize", { body: request.params });
      const to = safeUrl(r.redirect);
      if (!to) throw new Error(t("That didn't work. Try again."));
      window.location.assign(to);
    } catch (e) {
      toast(e instanceof Error ? e.message : t("That didn't work. Try again."), "error");
      setBusy(false);
    }
  }

  async function makeKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ key: string }>("/connectors/keys", { body: { name: keyName } });
      setFreshKey(r.key);
      setKeyName("");
      load();
    } catch (err) {
      toast(err instanceof Error ? err.message : t("That didn't work. Try again."), "error");
    }
    setBusy(false);
  }

  async function remove(id: string) {
    try {
      await api(`/connectors/${id}/disconnect`, { method: "POST" });
      toast(t("Disconnected"));
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : t("That didn't work. Try again."), "error");
    }
  }

  const lockedNote = !unlocked && (
    <div className="notice">{t("Your private balance is locked, so apps can't see it yet. Unlock it on the")} <Link href="/app">{t("home screen")}</Link>.</div>
  );

  return (
    <div className="narrow">
      <p className="eyebrow">{t("AI apps")}</p>
      <h1>{t("Use Scrim from your AI")}</h1>
      <p className="muted">{t("Connect Claude, ChatGPT, Codex, Cursor, Grok, Hermes Agent or any agent that speaks MCP. Ask it about your money in plain words.")}</p>

      {problem && <div className="notice" style={{ marginTop: 16 }}>{problem}</div>}

      {request && (
        <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
          <h2>{t("Connect {name}?", { name: request.name })}</h2>
          {request.suspicious && <div className="notice danger">{t("This app calls itself {name}, but it sends you back to {host}, which isn't {name}'s address. Don't connect it unless you're sure.", { name: request.name, host: request.returnsTo })}</div>}
          <p className="muted">{t("After you connect, you go back to")} <b style={{ overflowWrap: "anywhere" }}>{request.returnsTo}</b>. {t("Scrim doesn't check the names apps give themselves. Only connect if you just added Scrim in this app yourself.")}</p>
          <p className="muted">{t("It will use your account")} <b style={{ overflowWrap: "anywhere" }}>{accountId}</b>. {t("It can:")}</p>
          <ul>{CAN.map((c) => <li key={c}>{t(c)}</li>)}</ul>
          <p className="muted">{t("It can't move money by itself. Every swap, send or withdrawal it prepares opens in Scrim, and nothing moves until you confirm it with your wallet.")}</p>
          {lockedNote}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-signal btn-lg" onClick={allow} disabled={busy}>{busy && <Spinner />} {t("Connect")}</button>
            <a className="btn btn-ghost btn-lg" href={safeUrl(request.denyUrl) ?? "/app"}>{t("Cancel")}</a>
          </div>
        </section>
      )}

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>{t("Connect with a link")}</h2>
        <p className="muted">{t("For apps that let you sign in. Add Scrim as a remote MCP server with this address, then sign in here when the app asks.")}</p>
        <CopyField value={mcpUrl} label={t("Scrim MCP address")} />
        <dl className="detail-list">
          <div><dt>Claude</dt><dd>{t("Settings, Connectors, Add custom connector, paste the address.")}</dd></div>
          <div><dt>ChatGPT</dt><dd>{t("Settings, Apps and connectors, turn on developer mode, create a connector with the address.")}</dd></div>
          <div><dt>Claude Code</dt><dd><code style={{ overflowWrap: "anywhere" }}>claude mcp add --transport http scrim {mcpUrl}</code></dd></div>
          <div><dt>Codex</dt><dd><code style={{ overflowWrap: "anywhere" }}>codex mcp add scrim --url {mcpUrl}</code></dd></div>
          <div><dt>Cursor, VS Code</dt><dd><code style={{ overflowWrap: "anywhere" }}>{`{ "mcpServers": { "scrim": { "url": "${mcpUrl}" } } }`}</code></dd></div>
        </dl>
      </section>

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>{t("Connect with a key")}</h2>
        <p className="muted">{t("For agents that can't sign you in, like Hermes Agent, Grok, bots and scripts. The agent sends the key as a Bearer token to the same address.")}</p>
        {freshKey ? (
          <>
            <CopyField value={freshKey} label={t("Your key. It's shown only once.")} />
            <p className="muted small-print">{t("Keep it like a password. Anyone with it can read your balance and activity and prepare payments, but nothing moves until you confirm in Scrim. Remove it below at any time.")}</p>
            <code className="small-print">{`Authorization: Bearer ${freshKey.slice(0, 14)}…`}</code>
            <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setFreshKey(null)}>{t("Done")}</button>
          </>
        ) : (
          <form className="form-grid" onSubmit={makeKey}>
            <label className="field">{t("Name it")}<input className="input" value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Hermes Agent" maxLength={60} /></label>
            <button className="btn btn-primary" style={{ justifySelf: "start" }} disabled={busy}>{busy && <Spinner />} {t("Make a key")}</button>
          </form>
        )}
        {lockedNote}
      </section>

      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        <h2>{t("Connected")}</h2>
        {list === null ? <div className="skeleton" style={{ height: 48 }} /> : list.length === 0 ? <p className="muted">{t("No AI apps yet.")}</p> : (
          <dl className="detail-list">
            {list.map((c) => (
              <div key={c.id}>
                <dt>{c.name} <span className="muted small-print">{c.kind === "key" ? t("key") : t("app")}</span></dt>
                <dd className="between">
                  <span className="muted small-print">{t("Until")} {new Date(c.expiresAt).toLocaleDateString()}</span>
                  <button className="btn btn-ghost" onClick={() => remove(c.id)}>{t("Disconnect")}</button>
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

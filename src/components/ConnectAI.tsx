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

// Opened by an AI app: a short approve screen. Opened from the account panel: the connected apps, to remove.
// Setup steps live in the plugin (plugin/README.md), not in the app.
export function ConnectAI({ accountId, unlocked, request, problem }: { accountId: string; unlocked: boolean; request: Request | null; problem: string | null }) {
  const t = useT();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [list, setList] = useState<Connector[] | null>(null);
  const [freshKey, setFreshKey] = useState<string | null>(null);

  const load = useCallback(() => api<{ connectors: Connector[] }>("/connectors").then((r) => setList(r.connectors), () => setList([])), []);
  useEffect(() => { if (!request) load(); }, [load, request]);

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

  async function makeKey() {
    setBusy(true);
    try {
      setFreshKey((await api<{ key: string }>("/connectors/keys", { body: { name: "Agent key" } })).key);
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

  if (problem) return <div className="narrow"><div className="notice">{problem}</div></div>;

  if (request) {
    return (
      <div className="narrow">
        <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
          <h1>{t("Connect {name}?", { name: request.name })}</h1>
          {request.suspicious && <div className="notice danger">{t("This app calls itself {name}, but it sends you back to {host}, which isn't {name}'s address. Don't connect it unless you're sure.", { name: request.name, host: request.returnsTo })}</div>}
          <p className="muted">{t("It can see your balance and prepare payments. Nothing moves until you confirm in Scrim.")}</p>
          <p className="muted small-print" style={{ overflowWrap: "anywhere" }}>{accountId} · {request.returnsTo}</p>
          {!unlocked && <div className="notice">{t("Unlock your private balance on the")} <Link href="/app">{t("home screen")}</Link> {t("so it can see it.")}</div>}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-signal btn-lg" onClick={allow} disabled={busy}>{busy && <Spinner />} {t("Connect")}</button>
            <a className="btn btn-ghost btn-lg" href={safeUrl(request.denyUrl) ?? "/app"}>{t("Cancel")}</a>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="narrow">
      <h1>{t("Connected apps")}</h1>
      <section className="card card-pad form-grid" style={{ marginTop: 16 }}>
        {list === null ? <div className="skeleton" style={{ height: 48 }} /> : list.length === 0 ? <p className="muted">{t("No apps connected.")}</p> : (
          <dl className="detail-list">
            {list.map((c) => (
              <div key={c.id}>
                <dt>{c.name}</dt>
                <dd className="between">
                  <span className="muted small-print">{t("Until")} {new Date(c.expiresAt).toLocaleDateString()}</span>
                  <button className="btn btn-ghost" onClick={() => remove(c.id)}>{t("Disconnect")}</button>
                </dd>
              </div>
            ))}
          </dl>
        )}
        {freshKey ? (
          <>
            <CopyField value={freshKey} label={t("Your key. It's shown only once.")} />
            <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={() => setFreshKey(null)}>{t("Done")}</button>
          </>
        ) : (
          <button className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={makeKey} disabled={busy}>{busy && <Spinner />} {t("Make a key for an agent")}</button>
        )}
      </section>
    </div>
  );
}

"use client";
import { Fragment, useState } from "react";
import { useApi } from "@/client/use-api";
import { NETWORK_INFO } from "@/protocol/networks";
import { fmt, Heading, StateChip } from "./money";
import { useSession } from "./session";
import { useT } from "@/i18n/I18n";

type Row = {
  hash: string; at: string; ok: boolean; kind: "sent" | "received" | "action" | "account";
  counterparty: string | null; amount: string | null; token: { contract: string | null; symbol: string; decimals: number } | null; label: string;
};

const short = (v: string) => (v.length > 22 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v);
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

// The connected wallet's own transactions, read from the chain and shown here in plain words.
export function WalletActivityList() {
  const t = useT();
  const { network } = useSession();
  const { data, loading, error } = useApi<{ activity: Row[] }>("/wallet/activity", { every: 15_000 });
  const [open, setOpen] = useState<string | null>(null);
  const rows = data?.activity ?? [];
  if (loading && !data) return <div className="skeleton" />;
  if (error && !data) return <div className="card empty"><h3>Couldn&apos;t load your wallet activity</h3><p>{error}</p></div>;
  if (rows.length === 0) return <div className="card empty"><span className="icon">≡</span><h3>{t("Nothing yet")}</h3><p>{t("When this wallet sends, receives or approves, it shows up here.")}</p></div>;
  return (
    <div className="card table-card">
      <table className="table">
        <thead><tr><th>{t("What")}</th><th className="hide-sm">{t("With")}</th><th>{t("Amount")}</th><th>{t("Status")}</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const sign = r.kind === "sent" ? "−" : r.kind === "received" ? "+" : "";
            return (
              <Fragment key={r.hash}>
                <tr onClick={() => setOpen(open === r.hash ? null : r.hash)} aria-expanded={open === r.hash}>
                  <td><b>{r.label}</b><span className="sub">{when(r.at)}</span></td>
                  <td className="hide-sm">{r.counterparty ? <span className="mono" style={{ fontSize: 12 }}>{short(r.counterparty)}</span> : <span className="muted">—</span>}</td>
                  <td className="amt">{r.amount && r.token ? <>{sign}{fmt(r.amount, r.token.decimals)}<small>{r.token.symbol}</small></> : <span className="muted">—</span>}</td>
                  <td><StateChip status={r.ok ? "success" : "failed"} /></td>
                </tr>
                {open === r.hash && (
                  <tr className="row-details">
                    <td colSpan={4}>
                      <dl className="details">
                        {r.counterparty && <><dt>{r.kind === "received" ? "From" : "To"}</dt><dd className="mono">{r.counterparty}</dd></>}
                        <dt>{t("Time")}</dt><dd>{new Date(r.at).toLocaleString()}</dd>
                        <dt>{t("Transaction")}</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{r.hash}</dd>
                      </dl>
                      <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(r.hash); }}>Copy transaction ID</button>{" "}
                      <a className="btn btn-ghost btn-sm" href={`${NETWORK_INFO[network].explorerUrl}/txns/${r.hash}`} target="_blank" rel="noreferrer">{t("Receipt on explorer ↗")}</a>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function TestnetActivity() {
  const t = useT();
  return (
    <div className="narrow wide">
      <Heading eyebrow="Activity" title={t("Everything you've done")} text="Testnet transfers are public. On mainnet you can choose private for any payment." />
      <WalletActivityList />
      <p className="muted small-print">{t("Payments you approve and pay also appear under Accounts → History.")}</p>
    </div>
  );
}

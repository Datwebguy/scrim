"use client";
import { useApi } from "@/client/use-api";
import { Fragment, useState } from "react";
import { fmt, trimDecimals, Heading, isLate, KIND_LABEL, StateChip, type TransferView } from "./money";
import { WalletActivityList } from "./TestnetActivity";
import { useT } from "@/i18n/I18n";

export function Activity() {
  const t = useT();
  const tr = t;
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<"private" | "wallet">("private");
  const { data, loading } = useApi<{ transfers: TransferView[] }>(tab === "private" ? "/transfers" : null, { every: 10_000 });
  const rows = (data?.transfers ?? []).filter((t) => !["cancelled"].includes(t.status) && !(t.status === "expired" && t.kind !== "add"));
  return (
    <div className="narrow wide">
      <Heading eyebrow="Activity" title={t("Everything you've done")} text={tab === "private" ? "Private payments are listed here, only for you. Public ones are on the Wallet tab." : "Your connected wallet's own transactions. These are on the public blockchain."} />
      <div className="panel-tabs" role="tablist" style={{ margin: "0 0 16px" }}>
        <button role="tab" aria-selected={tab === "private"} onClick={() => setTab("private")}>Private</button>
        <button role="tab" aria-selected={tab === "wallet"} onClick={() => setTab("wallet")}>Wallet</button>
      </div>
      {tab === "wallet" ? <WalletActivityList /> : loading && !data ? <div className="skeleton" /> : rows.length === 0 ? (
        <div className="card empty"><span className="icon">≡</span><h3>{t("Nothing yet")}</h3><p>{t("When you add, send, swap or get paid, it shows up here.")}</p></div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>{t("What")}</th><th className="hide-sm">{t("Details")}</th><th>{t("Amount")}</th><th>{t("Status")}</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <Fragment key={t.id}>
                <tr onClick={() => setOpen(open === t.id ? null : t.id)} aria-expanded={open === t.id}>
                  <td><b>{tr(KIND_LABEL[t.kind] ?? t.kind)}</b><span className="sub">{new Date(t.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></td>
                  <td className="hide-sm">{t.kind === "swap" ? `${t.fromAsset.symbol} → ${t.toAsset.symbol}` : t.recipient ? <span className="mono" style={{ fontSize: 12 }}>{t.recipient.length > 22 ? `${t.recipient.slice(0, 10)}…${t.recipient.slice(-6)}` : t.recipient}</span> : t.toAsset.chainName}{t.note && <span className="sub">{t.note}</span>}</td>
                  <td className="amt">{fmt(t.amountOut, t.toAsset.decimals)}<small>{t.toAsset.symbol}</small></td>
                  <td><span className="row-end"><StateChip status={t.status} late={isLate(t)} /><span className={`row-chev${open === t.id ? " up" : ""}`} aria-hidden="true">›</span></span></td>
                </tr>
                {open === t.id && (
                  <tr className="row-details">
                    <td colSpan={4}>
                      <dl className="details">
                        <dt>{tr("You pay")}</dt><dd>{trimDecimals(fmt(t.amountIn, t.fromAsset.decimals))} {t.fromAsset.symbol} <span className="muted">· {t.fromAsset.chainName}</span></dd>
                        <dt>{tr("They get")}</dt><dd>{trimDecimals(fmt(t.amountOut, t.toAsset.decimals))} {t.toAsset.symbol} <span className="muted">· {t.toAsset.chainName}</span></dd>
                        {t.recipient && <><dt>{tr("To")}</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{t.recipient}</dd></>}
                        {t.note && <><dt>{tr("Note")}</dt><dd>{t.note}</dd></>}
                        <dt>{tr("Time")}</dt><dd>{new Date(t.createdAt).toLocaleString()}</dd>
                        {t.resultHashes.map((h) => <Fragment key={h}><dt>{tr("Transaction")}</dt><dd className="mono" style={{ wordBreak: "break-all" }}>{h}</dd></Fragment>)}
                      </dl>
                      {t.resultHashes[0] && <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(t.resultHashes[0]); }}>{tr("Copy transaction ID")}</button>}{" "}
                      {t.deposit && <a className="btn btn-primary btn-sm" href={`https://explorer.near-intents.org/transactions/${t.deposit.address}`} target="_blank" rel="noreferrer">{tr("Track on NEAR Intents ↗")}</a>}
                      {!t.deposit && !t.resultHashes[0] && <p className="muted small-print">{tr("Inside your private balance, so there is no public receipt.")}</p>}
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

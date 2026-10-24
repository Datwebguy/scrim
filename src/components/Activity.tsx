"use client";
import { useApi } from "@/client/use-api";
import { fmt, Heading, KIND_LABEL, StateChip, type TransferView } from "./money";

export function Activity() {
  const { data, loading } = useApi<{ transfers: TransferView[] }>("/transfers", { every: 10_000 });
  const rows = (data?.transfers ?? []).filter((t) => !["cancelled"].includes(t.status) && !(t.status === "expired" && t.kind !== "add"));
  return (
    <div className="narrow wide">
      <Heading eyebrow="Activity" title="Everything you've done" text="This list is private. It lives in your account and nowhere on the public blockchain." />
      {loading && !data ? <div className="skeleton" /> : rows.length === 0 ? (
        <div className="card empty"><span className="icon">≡</span><h3>Nothing yet</h3><p>When you add, send, swap or get paid, it shows up here.</p></div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead><tr><th>What</th><th className="hide-sm">Details</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id} style={{ cursor: "default" }}>
                  <td><b>{KIND_LABEL[t.kind] ?? t.kind}</b><span className="sub">{new Date(t.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></td>
                  <td className="hide-sm">{t.kind === "swap" ? `${t.fromAsset.symbol} → ${t.toAsset.symbol}` : t.recipient ? <span className="mono" style={{ fontSize: 12 }}>{t.recipient.length > 22 ? `${t.recipient.slice(0, 10)}…${t.recipient.slice(-6)}` : t.recipient}</span> : t.toAsset.networkName}{t.note && <span className="sub">{t.note}</span>}</td>
                  <td className="amt">{fmt(t.amountOut, t.toAsset.decimals)}<small>{t.toAsset.symbol}</small></td>
                  <td><StateChip status={t.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";
import { formatAmount } from "@/protocol/amount";
import type { Payment } from "@/server/payments";
import type { Treasury } from "@/server/treasuries";

const when = (value: string | Date) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const isPurchase = (p: Payment) => p.memo.startsWith("x402 ");
const who = (p: Payment) => (p.createdBy.type === "agent" ? p.createdBy.name ?? "An agent" : p.createdBy.id);

// A spreadsheet-safe cell: quoted, and never read as a formula by Excel or Sheets.
const cell = (value: string) => {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
};

// Everything that was paid from this account, one line each, for the people who keep the books.
export function Receipts({ payments, treasury }: { payments: Payment[]; treasury: Treasury }) {
  const paid = payments.filter((p) => p.status === "settled").sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  const symbol = treasury.unit.symbol;
  const amount = (p: Payment) => formatAmount(BigInt(p.amount), treasury.unit.decimals);
  const total = paid.reduce((sum, p) => sum + BigInt(p.amount), 0n);

  function download() {
    const rows = [
      ["Date", "Type", "Paid to", "Amount", "Coin", "Asked by", "Note", "Reference"],
      ...paid.map((p) => [new Date(p.createdAt).toISOString(), isPurchase(p) ? "Purchase" : "Payment", p.recipient, amount(p).replace(/,/g, ""), symbol, who(p), p.memo, p.id]),
    ];
    const blob = new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${treasury.name.replace(/[^\w-]+/g, "-")}-receipts.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (paid.length === 0) {
    return (
      <div className="empty">
        <p>No receipts yet</p>
        <p className="muted">Each payment that goes through shows up here with its date, who asked and who was paid.</p>
      </div>
    );
  }

  return (
    <>
      <div className="card card-pad" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <span><b>{paid.length}</b> paid · <b>{formatAmount(total, treasury.unit.decimals)} {symbol}</b> in total</span>
        <button className="btn btn-ghost" onClick={download}>Download as spreadsheet (CSV)</button>
      </div>
      <div className="card signer-list">
        {paid.map((p) => (
          <div key={p.id} className="signer-row" style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
            <span style={{ minWidth: 0, flex: "1 1 220px", overflowWrap: "anywhere" }}>
              <b>{amount(p)} {symbol}</b> to <span className="mono" style={{ overflowWrap: "anywhere" }}>{p.recipient}</span>
              <small className="muted" style={{ display: "block" }}>
                {isPurchase(p) ? "Purchase" : "Payment"} · asked by {who(p)} · {when(p.createdAt)}
                {p.memo && !isPurchase(p) ? ` · ${p.memo}` : ""}
              </small>
            </span>
            <span className="pill pill-green">Paid</span>
          </div>
        ))}
      </div>
    </>
  );
}

"use client";
import { useT } from "@/i18n/I18n";

export type Receive = "private" | "wallet";

// Where money you receive lands: your private balance, or straight into your NEAR wallet. Your choice.
export function ReceiveChoice({ value, onChange, onNear }: { value: Receive; onChange: (v: Receive) => void; onNear: boolean }) {
  const t = useT();
  return (
    <div className="field">
      <span className="picker-label">{t("Where it lands")}</span>
      <div className="segmented" role="radiogroup" aria-label="Where it lands">
        <button type="button" role="radio" aria-checked={value === "private"} onClick={() => onChange("private")}>Private balance</button>
        <button type="button" role="radio" aria-checked={value === "wallet"} disabled={!onNear} onClick={() => onChange("wallet")}>My wallet</button>
      </div>
      <small className="muted">
        {value === "private"
          ? "Lands in your private balance: payers can't see what you hold or receive."
          : "Lands in your NEAR wallet, like any transfer: it shows on the blockchain."}
        {!onNear && " To receive in your wallet, pick a coin on NEAR."}
      </small>
    </div>
  );
}

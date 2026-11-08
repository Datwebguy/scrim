"use client";
import { useT } from "@/i18n/I18n";

export type Receive = "private" | "wallet";

// Where money you receive lands: your private balance, or straight into your NEAR wallet. Your choice.
export function ReceiveChoice({ value, onChange, onNear }: { value: Receive; onChange: (v: Receive) => void; onNear: boolean }) {
  const t = useT();
  return (
    <>
      <span className="trade-label">{t("Where it lands")}</span>
      <div className="trade-src" role="radiogroup" aria-label={t("Where it lands")}>
        <button type="button" role="radio" aria-checked={value === "private"} onClick={() => onChange("private")}>{t("Private")}</button>
        <button type="button" role="radio" aria-checked={value === "wallet"} disabled={!onNear} onClick={() => onChange("wallet")}>{t("Public (my wallet)")}</button>
      </div>
      <p className="trade-note">
        {value === "private"
          ? "Lands in your private balance. Payers can't see what you hold."
          : "Lands in your NEAR wallet and shows on the blockchain."}
        {!onNear && " To receive in your wallet, pick a coin on NEAR."}
      </p>
    </>
  );
}

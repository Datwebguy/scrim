import { formatAmount } from "@/protocol/amount";

export const usdc = (minor: string | bigint) => formatAmount(minor);

export function short(value: string, head = 6, tail = 4) {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

export function relativeTime(input: string | Date) {
  const diff = (Date.now() - new Date(input).getTime()) / 1000;
  const abs = Math.abs(diff);
  const fmt = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (abs < 45) return diff >= 0 ? "just now" : "in a moment";
  if (abs < 3600) return fmt.format(-Math.round(diff / 60), "minute");
  if (abs < 86400) return fmt.format(-Math.round(diff / 3600), "hour");
  return fmt.format(-Math.round(diff / 86400), "day");
}

export const STATUS_LABEL: Record<string, string> = {
  policy_rejected: "Blocked by policy",
  awaiting_approval: "Awaiting approval",
  approved: "Approved",
  quoted: "Quote ready",
  submitting: "Submitting",
  settled: "Settled",
  failed: "Failed",
  expired: "Expired",
  cancelled: "Cancelled",
};

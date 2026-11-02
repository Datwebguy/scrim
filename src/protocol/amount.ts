// Token amounts are integers in the asset's smallest unit. Never use floats for money.

const USDC_DECIMALS = 6;

const DECIMAL = /^(\d{1,15})(?:\.(\d+))?$/;

// Commas are allowed only as thousands separators ("1,500.25"). "1,5" is refused rather than read as 15:
// someone typing a decimal comma must never send ten times what they meant.
const GROUPED = /^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/;

export function parseAmount(input: string, decimals = USDC_DECIMALS): bigint {
  const raw = input.trim();
  if (raw.includes(",") && !GROUPED.test(raw)) throw new RangeError("Use a dot for decimals, like 1.50.");
  const match = DECIMAL.exec(raw.replace(/,/g, ""));
  if (!match) throw new RangeError("Enter an amount like 250 or 250.50.");
  const [, whole, fraction = ""] = match;
  if (fraction.length > decimals) throw new RangeError(`Use at most ${decimals} decimal places.`);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, "0") || "0");
}

export function formatAmount(minor: bigint | string, decimals = USDC_DECIMALS, minFraction = 2): string {
  const value = BigInt(minor);
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toLocaleString("en-US");
  let fraction = (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  if (fraction.length < minFraction) fraction = fraction.padEnd(minFraction, "0");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}

// For showing a balance: the same as formatAmount, cut to at most maxFraction decimal places (never rounded up),
// so a 24-decimal NEAR balance reads 0.030005 rather than every digit.
export function formatBalance(minor: bigint | string, decimals: number, maxFraction = 6): string {
  const value = BigInt(minor);
  const cut = decimals > maxFraction ? 10n ** BigInt(decimals - maxFraction) : 1n;
  return formatAmount((value / cut) * cut, decimals, 2);
}

// Token amounts are integers in the asset's smallest unit. Never use floats for money.

export const USDC_DECIMALS = 6;

const DECIMAL = /^(\d{1,15})(?:\.(\d+))?$/;

export function parseAmount(input: string, decimals = USDC_DECIMALS): bigint {
  const match = DECIMAL.exec(input.trim().replace(/,/g, ""));
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

export function formatUsdc(minor: bigint | string): string {
  return `${formatAmount(minor)} USDC`;
}

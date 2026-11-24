// How much NEAR a wallet must hold to send a transaction. NEAR sets aside the gas a transaction asks for at a
// cautious price, about ten times today's gas price, plus any deposits, and refunds what isn't used. Measured on
// mainnet: a token payment (30 Tgas and a 0.00125 NEAR registration) needed 0.033 NEAR set aside. An account also
// keeps a little NEAR locked for its own storage. Too little and NEAR refuses the payment outright.
const NEAR = 10n ** 24n;
const PER_TGAS = 11n * 10n ** 20n; // 0.0011 NEAR set aside for each Tgas asked for
const REGISTRATION = 125n * 10n ** 19n; // 0.00125 NEAR, the one-off storage a token asks for
const OWN_STORAGE = 3n * 10n ** 21n; // 0.003 NEAR, with room, that the account itself keeps locked
const tgas = (n: bigint) => n * PER_TGAS;

export const NEAR_NEEDED = {
  // A plain NEAR transfer asks for almost no gas.
  nearSend: OWN_STORAGE + NEAR / 1000n,
  // Registering the receiver with the token, then the token transfer: 10 + 20 Tgas.
  tokenSend: OWN_STORAGE + tgas(30n) + REGISTRATION,
  // Registering with wNEAR, then wrapping: 10 + 10 Tgas.
  wrap: OWN_STORAGE + tgas(20n) + REGISTRATION,
  unwrap: OWN_STORAGE + tgas(10n),
  // Paying with the wallet's own NEAR through NEAR Intents: wrap it, then send it on: 50 Tgas and two registrations.
  nearPay: OWN_STORAGE + tgas(50n) + 2n * REGISTRATION,
} as const;

// "0.037" for a message: rounded up to the next thousandth of a NEAR.
export function nearText(yocto: bigint): string {
  const milli = (yocto + NEAR / 1000n - 1n) / (NEAR / 1000n);
  return (Number(milli) / 1000).toString();
}

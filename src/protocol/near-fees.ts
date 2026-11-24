// How much NEAR a wallet must hold to send a transaction. NEAR sets aside the gas a transaction asks for at a
// cautious price, about ten times today's gas price, plus any deposits, and refunds what isn't used. Measured on
// mainnet: asking for 30 Tgas plus a 0.00125 NEAR registration needed 0.033 NEAR set aside; asking for 15 Tgas went
// through from a wallet holding 0.01996 NEAR. An account also keeps a little NEAR locked for its own storage (0.00182
// for a plain account). Too little and NEAR refuses the payment outright. The gas asked for is set in client/wallet.ts.
const NEAR = 10n ** 24n;
const PER_TGAS = 11n * 10n ** 20n; // 0.0011 NEAR set aside for each Tgas asked for
const REGISTRATION = 125n * 10n ** 19n; // 0.00125 NEAR, the one-off storage a token asks for
const OWN_STORAGE = 2n * 10n ** 21n; // 0.002 NEAR that the account itself keeps locked
const tgas = (n: bigint) => n * PER_TGAS;

export const NEAR_NEEDED = {
  // A plain NEAR transfer asks for almost no gas.
  nearSend: OWN_STORAGE + NEAR / 1000n,
  // Registering the receiver with the token, then the token transfer: 5 + 10 Tgas.
  tokenSend: OWN_STORAGE + tgas(15n) + REGISTRATION,
  // A token transfer to an account the token already knows: 10 Tgas.
  tokenSendRegistered: OWN_STORAGE + tgas(10n),
  // Registering with wNEAR, then wrapping: 5 + 10 Tgas.
  wrap: OWN_STORAGE + tgas(15n) + REGISTRATION,
  unwrap: OWN_STORAGE + tgas(10n),
  // Paying with the wallet's own NEAR through NEAR Intents: register and wrap it, register the receiver, send: 30 Tgas.
  nearPay: OWN_STORAGE + tgas(30n) + 2n * REGISTRATION,
} as const;

// "0.037" for a message: rounded up to the next thousandth of a NEAR.
export function nearText(yocto: bigint): string {
  const milli = (yocto + NEAR / 1000n - 1n) / (NEAR / 1000n);
  return (Number(milli) / 1000).toString();
}

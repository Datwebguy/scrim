-- Ask credits bought straight from the person's NEAR wallet: one row per on-chain USDC transfer to the
-- site owner, so each transfer is credited once.
CREATE TABLE ask_wallet_topups (
  tx_hash     text PRIMARY KEY,
  account_id  text NOT NULL,
  usd_micros  bigint NOT NULL CHECK (usd_micros > 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

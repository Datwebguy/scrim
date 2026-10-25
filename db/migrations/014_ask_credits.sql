-- Ask: one free question per account, then people pay from their own private balance. They top up
-- Ask credits with one private transfer to the site owner; each question takes its price from them.
DROP TABLE IF EXISTS ask_usage;
CREATE TABLE ask_credits (
  account_id     text PRIMARY KEY,
  free_used      boolean NOT NULL DEFAULT false,
  balance_micros bigint NOT NULL DEFAULT 0 CHECK (balance_micros >= 0),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ask_topups (
  transfer_id  uuid PRIMARY KEY REFERENCES transfers(id) ON DELETE CASCADE,
  account_id   text NOT NULL,
  usd_micros   bigint NOT NULL CHECK (usd_micros > 0),
  credited_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

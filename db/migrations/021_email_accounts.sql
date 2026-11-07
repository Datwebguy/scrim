-- People who sign in with an email. Privy keeps each person's key and checks their login before it signs;
-- Scrim keeps only which Privy user owns which NEAR account.
CREATE TABLE email_accounts (
  privy_user_id text PRIMARY KEY,
  wallet_id     text NOT NULL UNIQUE,
  account_id    text NOT NULL UNIQUE,
  public_key    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

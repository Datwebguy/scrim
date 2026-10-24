-- Private money: confidential balance access, transfers, proofs, and payment links.
-- Sensitive details (amounts, recipients, notes, session tokens) are sealed with AES-256-GCM
-- before they reach this database.

ALTER TABLE auth_challenges DROP CONSTRAINT auth_challenges_purpose_check;
ALTER TABLE auth_challenges ADD CONSTRAINT auth_challenges_purpose_check
  CHECK (purpose IN ('sign_in', 'approve_payment', 'private_access'));

CREATE TABLE private_access (
  session_id          uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  account_id          text NOT NULL,
  public_key          text NOT NULL,
  status              text NOT NULL CHECK (status IN ('active', 'needs_setup', 'unavailable', 'expired')),
  tokens_sealed       text,
  access_expires_at   timestamptz,
  refresh_expires_at  timestamptz,
  detail              text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pay_links (
  id            text PRIMARY KEY,
  account_id    text NOT NULL,
  asset_id      text NOT NULL,
  amount        numeric(78, 0) NOT NULL CHECK (amount > 0),
  details_sealed text NOT NULL,
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paid', 'closed')),
  expires_at    timestamptz NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pay_links_account ON pay_links (account_id, created_at DESC);

CREATE TABLE transfers (
  id               uuid PRIMARY KEY,
  account_id       text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('add', 'swap', 'send', 'withdraw', 'link_payment')),
  status           text NOT NULL CHECK (status IN (
                     'awaiting_deposit', 'awaiting_signature', 'processing',
                     'success', 'refunded', 'failed', 'expired', 'cancelled')),
  deposit_address  text,
  deposit_memo     text,
  intent_hash      text,
  details_sealed   text NOT NULL,
  team_request_id  uuid REFERENCES payment_requests(id) ON DELETE SET NULL,
  pay_link_id      text REFERENCES pay_links(id) ON DELETE SET NULL,
  expires_at       timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX transfers_account ON transfers (account_id, created_at DESC);
CREATE INDEX transfers_open ON transfers (status) WHERE status IN ('awaiting_deposit', 'processing');

CREATE TABLE proofs (
  id               uuid PRIMARY KEY,
  account_id       text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('balance_at_least', 'payment')),
  details_sealed   text NOT NULL,
  expires_at       timestamptz NOT NULL,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX proofs_account ON proofs (account_id, created_at DESC);

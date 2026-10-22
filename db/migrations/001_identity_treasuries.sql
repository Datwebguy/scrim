BEGIN;
CREATE TABLE IF NOT EXISTS scrim_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE auth_challenges (
  id uuid PRIMARY KEY, account_id text NOT NULL, payload text NOT NULL, nonce text NOT NULL,
  recipient text NOT NULL, state_hash char(64) NOT NULL, expires_at timestamptz NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('session','treasury:create','quote:accept')),
  action_hash char(64), session_hash char(64), consumed_at timestamptz,
  CHECK ((purpose = 'session' AND action_hash IS NULL AND session_hash IS NULL) OR (purpose <> 'session' AND action_hash IS NOT NULL AND session_hash IS NOT NULL))
);
CREATE INDEX challenge_expiry ON auth_challenges(expires_at);
CREATE TABLE sessions (
  token_hash char(64) PRIMARY KEY, account_id text NOT NULL, network text NOT NULL,
  csrf_hash char(64) NOT NULL, authorization_block text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE TABLE treasury_intents (
  id uuid PRIMARY KEY, actor text NOT NULL, network text NOT NULL, config jsonb NOT NULL,
  config_hash char(64) NOT NULL, status text NOT NULL CHECK (status IN ('awaiting_chain_confirmation','active')),
  idempotency_key uuid NOT NULL, transaction_hash text, confirmation_block text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(actor, network, idempotency_key)
);
CREATE UNIQUE INDEX unique_active_contract ON treasury_intents(network, (config->>'contractAccountId')) WHERE status = 'active';
CREATE TABLE authorization_events (
  id bigserial PRIMARY KEY, action text NOT NULL, account_id text NOT NULL,
  subject_id uuid, block_hash text, created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO scrim_migrations(version) VALUES(1);
COMMIT;

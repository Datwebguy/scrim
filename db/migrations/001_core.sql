-- Scrim Phase A operational schema.
-- This database is coordination state, not financial truth. It never stores private keys,
-- wallet secrets, or agent API keys in recoverable form.

CREATE TABLE auth_challenges (
  id            uuid PRIMARY KEY,
  purpose       text NOT NULL CHECK (purpose IN ('sign_in', 'approve_payment')),
  subject       text,                       -- e.g. payment request id for approvals
  message       text NOT NULL,
  nonce         bytea NOT NULL CHECK (octet_length(nonce) = 32),
  recipient     text NOT NULL,
  session_id    uuid,                       -- approval challenges are bound to the issuing session
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX auth_challenges_nonce ON auth_challenges (nonce);

CREATE TABLE sessions (
  id            uuid PRIMARY KEY,
  token_hash    bytea NOT NULL UNIQUE,
  account_id    text NOT NULL,
  public_key    text NOT NULL,
  network       text NOT NULL,
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_account ON sessions (account_id);

CREATE TABLE treasuries (
  id                  uuid PRIMARY KEY,
  name                text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  kind                text NOT NULL CHECK (kind IN ('individual', 'team')),
  owner_account_id    text NOT NULL,
  threshold_required  int  NOT NULL CHECK (threshold_required >= 1),
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'recovery')),
  network             text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE treasury_signers (
  treasury_id   uuid NOT NULL REFERENCES treasuries(id) ON DELETE CASCADE,
  account_id    text NOT NULL,
  role          text NOT NULL CHECK (role IN ('owner', 'signer')),
  added_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (treasury_id, account_id)
);
CREATE INDEX treasury_signers_account ON treasury_signers (account_id);

CREATE TABLE agents (
  id                 uuid PRIMARY KEY,
  treasury_id        uuid NOT NULL REFERENCES treasuries(id) ON DELETE CASCADE,
  name               text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 60),
  mode               text NOT NULL DEFAULT 'request_only' CHECK (mode IN ('request_only', 'autonomous')),
  enabled            boolean NOT NULL DEFAULT true,
  policy_version     int  NOT NULL,
  key_prefix         text NOT NULL,
  key_hash           bytea NOT NULL UNIQUE,
  created_by         text NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  paused_at          timestamptz
);

-- Immutable policy history. A request always references the exact version it was judged against.
CREATE TABLE agent_policies (
  agent_id      uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  version       int  NOT NULL,
  policy        jsonb NOT NULL,
  commitment    text NOT NULL,
  created_by    text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (agent_id, version)
);

CREATE TABLE payment_requests (
  id                uuid PRIMARY KEY,
  treasury_id       uuid NOT NULL REFERENCES treasuries(id) ON DELETE CASCADE,
  created_by_type   text NOT NULL CHECK (created_by_type IN ('human', 'agent')),
  created_by_id     text NOT NULL,
  agent_id          uuid REFERENCES agents(id),
  corridor          text NOT NULL,
  recipient         text NOT NULL,
  amount            numeric(39, 0) NOT NULL CHECK (amount > 0),
  memo              text NOT NULL DEFAULT '',
  policy_version    int,
  policy_decision   jsonb,
  commitment        text NOT NULL,
  idempotency_key   text NOT NULL,
  status            text NOT NULL CHECK (status IN (
                      'policy_rejected', 'awaiting_approval', 'approved', 'quoted',
                      'submitting', 'settled', 'failed', 'expired', 'cancelled')),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (treasury_id, idempotency_key)
);
CREATE INDEX payment_requests_treasury ON payment_requests (treasury_id, created_at DESC);
CREATE INDEX payment_requests_agent_window ON payment_requests (agent_id, created_at);

CREATE TABLE approvals (
  request_id    uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  account_id    text NOT NULL,
  public_key    text NOT NULL,
  signature     text NOT NULL,
  challenge_id  uuid NOT NULL REFERENCES auth_challenges(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, account_id)
);

CREATE TABLE quotes (
  id                uuid PRIMARY KEY,
  request_id        uuid NOT NULL REFERENCES payment_requests(id) ON DELETE CASCADE,
  provider          text NOT NULL,
  confidentiality   text NOT NULL,
  amount_in         numeric(39, 0) NOT NULL,
  amount_out        numeric(39, 0) NOT NULL,
  min_amount_out    numeric(39, 0) NOT NULL,
  time_estimate_s   int,
  deadline          timestamptz NOT NULL,
  quote_commitment  text NOT NULL,
  raw               jsonb NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX quotes_request ON quotes (request_id, created_at DESC);

-- Append-only audit trail. Never updated or deleted by application code.
CREATE TABLE audit_events (
  id            bigserial PRIMARY KEY,
  treasury_id   uuid REFERENCES treasuries(id) ON DELETE CASCADE,
  actor_type    text NOT NULL CHECK (actor_type IN ('human', 'agent', 'system')),
  actor_id      text NOT NULL,
  action        text NOT NULL,
  subject_id    text,
  data          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_treasury ON audit_events (treasury_id, id DESC);

-- Agent connections: a webhook each agent can receive updates on, and Telegram alerts for people.
ALTER TABLE agents ADD COLUMN webhook_url text;
ALTER TABLE agents ADD COLUMN webhook_secret text;          -- sealed; used to sign deliveries
ALTER TABLE agents ADD COLUMN key_rotated_at timestamptz;

CREATE TABLE webhook_deliveries (
  id           bigserial PRIMARY KEY,
  agent_id     uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  request_id   uuid REFERENCES payment_requests(id) ON DELETE CASCADE,
  event        text NOT NULL,
  status_code  int,
  ok           boolean NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_deliveries_agent ON webhook_deliveries (agent_id, created_at DESC);

CREATE TABLE telegram_links (
  account_id   text NOT NULL,
  network      text NOT NULL CHECK (network IN ('mainnet', 'testnet')),
  chat_id      text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, network)
);

CREATE TABLE telegram_link_codes (
  code         text PRIMARY KEY,
  account_id   text NOT NULL,
  network      text NOT NULL,
  expires_at   timestamptz NOT NULL
);

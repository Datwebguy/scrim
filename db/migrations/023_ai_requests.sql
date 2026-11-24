-- Payments an AI app prepared for a person. Each waits in Scrim until the person confirms it with their wallet,
-- declines it, or it expires. The AI app can only read where its own requests stand.
CREATE TABLE ai_requests (
  id          uuid PRIMARY KEY,
  account_id  text NOT NULL,
  network     text NOT NULL,
  client_id   text REFERENCES oauth_clients(id) ON DELETE SET NULL,
  app_name    text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('swap', 'send', 'withdraw')),
  details     jsonb NOT NULL,
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'declined')),
  transfer_id uuid REFERENCES transfers(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
CREATE INDEX ai_requests_account ON ai_requests (account_id, network, created_at DESC);

-- An agent's own wallet, held in OutLayer's enclaves. Scrim keeps the wallet's API key sealed.
CREATE TABLE agent_wallets (
  agent_id        uuid PRIMARY KEY REFERENCES agents(id) ON DELETE CASCADE,
  network         text NOT NULL CHECK (network IN ('mainnet', 'testnet')),
  wallet_id       text NOT NULL,
  account_id      text NOT NULL,
  secret_sealed   text NOT NULL,   -- { apiKey, handoffUrl }
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Payments an autonomous agent made from its own wallet.
CREATE TABLE agent_payouts (
  request_id         uuid PRIMARY KEY REFERENCES payment_requests(id) ON DELETE CASCADE,
  agent_id           uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  wallet_request_id  text,
  tx_hash            text,
  status             text NOT NULL CHECK (status IN ('sending', 'success', 'failed', 'needs_review')),
  error              text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now()
);

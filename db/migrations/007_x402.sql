-- x402 operations: one row per quoted payment instrument (network:depositAddress[:memo]).
-- Holds the in-flight claim and, once known, the one recorded settlement result.
CREATE TABLE x402_operations (
  instrument     text PRIMARY KEY,
  link_id        text NOT NULL REFERENCES pay_links(id) ON DELETE CASCADE,
  transfer_id    uuid NOT NULL,
  resource       text NOT NULL,
  network        text NOT NULL,
  asset          text NOT NULL,
  claimed_until  timestamptz,
  result         jsonb,
  executed_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX x402_operations_link ON x402_operations (link_id);

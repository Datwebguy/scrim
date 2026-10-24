-- x402 purchases made by agents: one per team payment request. The seller's terms, the quote we paid,
-- and what the seller returned once paid (sealed).
CREATE TABLE x402_purchases (
  request_id     uuid PRIMARY KEY REFERENCES payment_requests(id) ON DELETE CASCADE,
  url            text NOT NULL,
  entry          jsonb NOT NULL,
  status         text NOT NULL CHECK (status IN ('requested', 'stopped', 'paying', 'delivering', 'delivered', 'failed')),
  quote_sealed   text,
  result_sealed  text,
  error          text,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

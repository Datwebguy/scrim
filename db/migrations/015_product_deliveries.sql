-- What each paid purchase received, kept so asking again returns the same copy instead of calling the
-- seller's API again (one payment, one call).
CREATE TABLE product_deliveries (
  purchase_key   text PRIMARY KEY,       -- the link payment id, or the x402 operation
  link_id        text NOT NULL REFERENCES pay_links(id) ON DELETE CASCADE,
  response_sealed text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

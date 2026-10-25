-- When an agent's wallet signed a seller's payment: from then on the purchase is never signed again,
-- and it counts against the agent's spending limits whatever the seller answered.
ALTER TABLE x402_purchases ADD COLUMN signed_at timestamptz;
-- The one transfer paying a request. Only its outcome may move the request; any other transfer for the
-- same request (an earlier attempt, a late wallet payment) can never settle, fail or reopen it.
ALTER TABLE payment_requests ADD COLUMN payout_transfer_id uuid;

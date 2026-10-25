-- Agents with their own wallet also pay standard x402 sellers (a signed USDC authorization on an EVM chain
-- or Solana), topping up the wallet's address on that chain first when it is short.
ALTER TABLE x402_purchases ADD COLUMN route text NOT NULL DEFAULT 'near-intents' CHECK (route IN ('near-intents', 'wallet'));
ALTER TABLE x402_purchases DROP CONSTRAINT x402_purchases_status_check;
ALTER TABLE x402_purchases ADD CONSTRAINT x402_purchases_status_check
  CHECK (status IN ('requested', 'stopped', 'funding', 'paying', 'delivering', 'delivered', 'failed'));
ALTER TABLE x402_purchases ADD COLUMN funding_request_id text;

-- A testnet transaction can settle only one team request.
ALTER TABLE payment_requests ADD COLUMN settled_tx_hash text;
CREATE UNIQUE INDEX payment_requests_settled_tx ON payment_requests (settled_tx_hash) WHERE settled_tx_hash IS NOT NULL;

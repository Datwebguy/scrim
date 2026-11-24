-- A wallet transaction can complete one prepared payment, never two.
CREATE UNIQUE INDEX ai_requests_tx_hash ON ai_requests (tx_hash) WHERE tx_hash IS NOT NULL;

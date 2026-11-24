-- A prepared payment the person paid straight from their NEAR wallet (a send to a NEAR account, or NEAR wrapped
-- or unwrapped) has no Scrim transfer; the wallet's transaction hash records that it was paid.
ALTER TABLE ai_requests ADD COLUMN tx_hash text;
ALTER TABLE ai_requests DROP CONSTRAINT ai_requests_status_check;
ALTER TABLE ai_requests ADD CONSTRAINT ai_requests_status_check CHECK (status IN ('pending', 'declined', 'sent'));

-- Requests already being paid when this runs: bind each to the transfer paying it.
UPDATE payment_requests p SET payout_transfer_id = (
  SELECT t.id FROM transfers t WHERE t.team_request_id = p.id AND t.status IN ('processing', 'success') ORDER BY t.created_at DESC LIMIT 1)
WHERE p.status = 'submitting';

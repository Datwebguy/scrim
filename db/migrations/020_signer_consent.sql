-- Being added to someone's account needs your yes. An invited person is not an approver until they accept.
ALTER TABLE treasury_signers ADD COLUMN accepted_at timestamptz;
ALTER TABLE treasury_signers ADD COLUMN declined_at timestamptz;
-- Everyone already on an account keeps their place.
UPDATE treasury_signers SET accepted_at = added_at;

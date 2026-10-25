-- Privacy is a choice: a payment link or product pays into the owner's private balance or straight
-- into their NEAR wallet, as they pick.
ALTER TABLE pay_links ADD COLUMN receive text NOT NULL DEFAULT 'private' CHECK (receive IN ('private', 'wallet'));

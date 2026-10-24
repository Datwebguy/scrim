-- Testnet and mainnet side by side. The same implicit account can exist on both networks, so every
-- row that belongs to an account also records the network it belongs to.
ALTER TABLE auth_challenges ADD COLUMN network text NOT NULL DEFAULT 'mainnet' CHECK (network IN ('mainnet', 'testnet'));
ALTER TABLE sessions        ADD CONSTRAINT sessions_network_check CHECK (network IN ('mainnet', 'testnet'));
ALTER TABLE transfers       ADD COLUMN network text NOT NULL DEFAULT 'mainnet' CHECK (network IN ('mainnet', 'testnet'));
ALTER TABLE pay_links       ADD COLUMN network text NOT NULL DEFAULT 'mainnet' CHECK (network IN ('mainnet', 'testnet'));
ALTER TABLE proofs          ADD COLUMN network text NOT NULL DEFAULT 'mainnet' CHECK (network IN ('mainnet', 'testnet'));
ALTER TABLE treasuries      ADD CONSTRAINT treasuries_network_check CHECK (network IN ('mainnet', 'testnet'));
CREATE INDEX transfers_account_network ON transfers (account_id, network, created_at DESC);
CREATE INDEX pay_links_account_network ON pay_links (account_id, network, created_at DESC);
CREATE INDEX proofs_account_network ON proofs (account_id, network, created_at DESC);

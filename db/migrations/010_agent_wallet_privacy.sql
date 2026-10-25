-- Mainnet agent wallets pay from their private balance unless the owner chooses public.
ALTER TABLE agent_wallets ADD COLUMN private boolean NOT NULL DEFAULT true;

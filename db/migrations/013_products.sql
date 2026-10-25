-- Selling with x402: a product is a payment link that can be paid any number of times and hands
-- the buyer something once paid (sealed: a text or link, or the seller's own API that Scrim calls).
ALTER TABLE pay_links ADD COLUMN product_sealed text;

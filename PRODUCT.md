# PRODUCT.md

This is a long-term product, not a feature and not a hackathon entry. It is infrastructure for private payments and treasuries that people and AI agents will use every day. The goal is real volume, real users, and durable adoption on NEAR.

Scrim lets users and agents hold, send, and receive assets privately by default across chains. Balances live in a shielded environment. Anyone can prove a specific fact to one named reader for a limited time: a payment was made, a balance is above a threshold, a payroll batch totals a certain amount, or an agent stayed inside its spending cap. The proof expires. Settlement happens through NEAR Intents and Chain Signatures so the money moves on the destination chain without a traditional bridge or public exposure of the sender, recipient, or amount.

Agents get programmable rails. An agent receives a spending limit, a list of approved counterparties, and rules for when it may generate a selective disclosure proof. Humans and teams get the same controls plus multi-party approval. Organizations can run confidential treasuries that add agent-triggered actions, expiry on every proof, and device-side or TEE-assisted proving so no central operator holds the private keys.

The system is built for scale. It can serve individual users, small teams, larger treasuries, and autonomous agents that need to pay for services or settle between themselves. Public settlement records stay minimal. Private state stays private unless a deliberate, time-bounded proof is produced. The architecture combines shielded pool patterns, intent-based settlement, selective disclosure, and agent constraints so the product can grow from a working demo into production infrastructure with thousands of users.

External patterns that informed the design stay in research notes only and never appear in the public repository, README, UI, or backend.

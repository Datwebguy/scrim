# NEAR building blocks Scrim uses

Everything here was read from NEAR's own documentation and code, then checked against the live services.

## NEAR Intents and Confidential Intents
Users state an outcome; solvers fill it across chains. Confidential Intents adds a private ledger so deposits and withdrawals can't be matched, live for businesses since July 2026. Docs: https://docs.near-intents.org (index at `/llms.txt`).

**1Click API** (`https://1click.chaindefuser.com`)
- `GET /v0/tokens`: 200+ assets on 37 chains with prices.
- `POST /v0/auth/authenticate`, `/v0/auth/refresh`: open a private session from a signed ownership message.
- `GET /v0/account/balances`: private balances for a signed-in person.
- `POST /v0/quote`: price a route. Confidential routes need a partner key (`X-API-Key`) and the person's session (`Authorization: Bearer`).
- `POST /v0/generate-intent`, `POST /v0/submit-intent`: produce, then submit, the transfer the wallet signs.
- `GET /v0/status`: follow a transfer to the end.
- `GET /v0/account/history`: invite-only at present, so Scrim keeps its own record.

**Bridge** (`https://bridge.chaindefuser.com/rpc`): `deposit_address` and `supported_tokens` give one-time deposit addresses for 30+ networks. Some chains (for example Stellar) need a memo.

**Fees:** protocol fee 0.0001%. 1Click without a partner key adds 0.25%; with a key, typically 0.20% (0.01% on stablecoins). Apply for a free key at https://partners.near-intents.org.

**Incident to know about:** a bug in NEAR Intents' deposit-notification feature allowed about $3.8M in unbacked withdrawals between 29 Sep and 1 Oct 2026. The contract was paused within about 30 minutes of detection, funds were returned within 36 hours, the feature was removed, and a second bug in the same function was patched on 7 Oct. Scrim starts with small limits and says plainly that it is new software.

## NEAR Connect (`@hot-labs/near-connect`)
Wallet connection for HOT, Meteor, Intear, MyNearWallet, Nightly, OKX and more. Scrim uses message signing and, for named accounts, one `add_public_key` call to `intents.near`.

## Chain Signatures
Lets a NEAR account sign on other chains through an MPC network, so an account that holds no keys of its own, such as a DAO, can still pay on those chains. Scrim does not need it for personal and team accounts today; it is the path for contract-owned accounts.

## NEAR AI Cloud and OutLayer (planned)
Private inference in TEEs (`https://cloud-api.near.ai/v1`) and TEE-held, policy-guarded wallets for software. Candidate homes for private decision logic and for device-independent proving.

## Wallet and account notes
Account keys on NEAR can be full-access or function-call only. Sign-in requires a full-access key. Implicit accounts (64 hex characters) work without registration.

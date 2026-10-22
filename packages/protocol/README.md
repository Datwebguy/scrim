# Scrim protocol package

The protocol package contains canonical JSON configuration hashing, account/config validation, shared errors, and public protocol TypeScript declarations. Note/nullifier/proof types are not cryptographic implementations; their circuit design remains pending.

Every encoded object must be versioned. A client must reject an unknown version rather than attempting a best-effort decode. Private witness data remains outside this package's network-facing interfaces.

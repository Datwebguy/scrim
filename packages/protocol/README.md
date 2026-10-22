# Scrim protocol package

The protocol package will contain shared canonical encodings for notes, commitments, nullifiers, policy commitments, proof statements, intent requests, and encrypted audit envelopes.

Every encoded object must be versioned. A client must reject an unknown version rather than attempting a best-effort decode. Private witness data remains outside this package's network-facing interfaces.

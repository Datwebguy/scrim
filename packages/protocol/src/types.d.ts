export type Network = 'mainnet' | 'testnet';
export type Scope = 'session' | 'treasury:create' | 'quote:accept';
export interface OffchainMessage { chain_id: Network; signer_id: string; path?: string[]; timestamp: string; payload: string }
export interface PinnedBlock { hash: string; timestampNs: bigint }
export interface Resolution { payload: string; pending?: { account_id: string; authorization: string; expect: string }[] }
export interface Challenge { id: string; accountId: string; payload: string; nonce: string; stateHash: string; expiresAt: number; purpose: Scope; actionHash: string | null; sessionHash: string | null }
export interface Session { accountId: string; network: Network; expiresAt: number; blockHash: string; csrfHash: string }
export interface TreasuryConfig { kind: 'individual' | 'team'; contractAccountId: string; signerAccounts: string[]; threshold: number; policyCommitment: string }
export interface TreasuryIntent { id: string; actor: string; config: TreasuryConfig; configHash: string; status: 'awaiting_chain_confirmation' | 'active'; transactionHash?: string; network: Network }
export interface RelayPolicy { allowedTargets: readonly string[]; callCommitment: string }
// Reader/nonce/expiry/statement bindings remain proposed until circuit public inputs are defined.
export interface ProposedDisclosure { readerPublicKey: string; nonce: string; expiresAt: string; statementCommitment: string; verificationKeyId: string }

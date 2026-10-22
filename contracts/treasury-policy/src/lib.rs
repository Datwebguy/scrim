use near_sdk::{env, near, AccountId, PanicOnDefault, assert_one_yocto};
use near_sdk::serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Clone, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
pub struct Config {
    pub kind: String,
    pub signer_accounts: Vec<AccountId>,
    pub threshold: u8,
    pub policy_commitment: String,
    pub config_hash: String,
}

#[derive(borsh::BorshDeserialize, borsh::BorshSerialize, Clone)]
pub struct Proposal {
    signers: Vec<AccountId>,
    threshold: u8,
    policy_commitment: String,
    config_hash: String,
    approvals: BTreeSet<AccountId>,
    expires_at_ns: u64,
    base_version: u64,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct AuthBundle { payload: String, members: Vec<MemberAuth> }
#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", deny_unknown_fields)]
struct MemberAuth { account_id: AccountId, authorization: String }
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Resolution { payload: String, pending: Vec<Pending> }
#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct Pending { account_id: AccountId, authorization: String, expect: String }

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TreasuryPolicy {
    kind: String,
    signers: Vec<AccountId>,
    threshold: u8,
    policy_commitment: String,
    config_hash: String,
    version: u64,
    next_id: u64,
    proposals: BTreeMap<u64, Proposal>,
}

fn valid_hash(s: &str) -> bool { s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) }
fn validate(kind: &str, signers: &mut Vec<AccountId>, threshold: u8, commitment: &str, config_hash: &str) {
    assert!(kind == "individual" || kind == "team", "Invalid treasury kind");
    signers.sort();
    assert!(signers.windows(2).all(|v| v[0] != v[1]), "Duplicate signer");
    assert!(signers.len() <= 25, "Too many signers");
    if kind == "individual" { assert!(signers.len() == 1 && threshold == 1, "Individual requires 1-of-1"); }
    else { assert!(signers.len() >= 3 && threshold >= 2 && usize::from(threshold) <= signers.len(), "Invalid team threshold"); }
    assert!(valid_hash(commitment) && valid_hash(config_hash), "Invalid commitment");
}

#[near]
impl TreasuryPolicy {
    #[init]
    pub fn new(kind: String, mut signer_accounts: Vec<AccountId>, threshold: u8, policy_commitment: String, config_hash: String) -> Self {
        validate(&kind, &mut signer_accounts, threshold, &policy_commitment, &config_hash);
        assert!(!signer_accounts.contains(&env::current_account_id()), "Contract cannot be its own signer");
        assert_eq!(env::signer_account_id(), env::predecessor_account_id(), "Direct owner transaction required");
        assert!(signer_accounts.contains(&env::predecessor_account_id()), "Initializer must be a signer");
        Self { kind, signers: signer_accounts, threshold, policy_commitment, config_hash, version: 1, next_id: 0, proposals: BTreeMap::new() }
    }
    pub fn get_config(&self) -> Config {
        Config { kind: self.kind.clone(), signer_accounts: self.signers.clone(), threshold: self.threshold, policy_commitment: self.policy_commitment.clone(), config_hash: self.config_hash.clone() }
    }
    pub fn get_policy_version(&self) -> u64 { self.version }
    pub fn list_proposal_ids(&self) -> Vec<u64> { self.proposals.keys().copied().collect() }
    pub fn get_proposal(&self, proposal_id: u64) -> near_sdk::serde_json::Value {
        let p = self.proposals.get(&proposal_id).expect("Proposal missing");
        near_sdk::serde_json::json!({
            "signer_accounts": p.signers, "threshold": p.threshold,
            "policy_commitment": p.policy_commitment, "config_hash": p.config_hash,
            "approvals": p.approvals, "expires_at_ns": p.expires_at_ns.to_string(), "base_version": p.base_version
        })
    }

    #[payable]
    pub fn propose_config(&mut self, mut signer_accounts: Vec<AccountId>, threshold: u8, policy_commitment: String, config_hash: String, expires_at_ns: String) -> u64 {
        assert_one_yocto(); self.assert_member();
        validate(&self.kind, &mut signer_accounts, threshold, &policy_commitment, &config_hash);
        assert!(!signer_accounts.contains(&env::current_account_id()), "Contract cannot be its own signer");
        let expiry = expires_at_ns.parse::<u64>().expect("Invalid expiry");
        assert!(expiry > env::block_timestamp() && expiry <= env::block_timestamp().checked_add(86_400_000_000_000).unwrap(), "Expiry must be within 24 hours");
        assert!(self.proposals.len() < 100, "Proposal capacity reached; clear stale proposals");
        let id = self.next_id; self.next_id = self.next_id.checked_add(1).expect("Overflow");
        self.proposals.insert(id, Proposal { signers: signer_accounts, threshold, policy_commitment, config_hash, approvals: BTreeSet::from([env::predecessor_account_id()]), expires_at_ns: expiry, base_version: self.version });
        id
    }
    #[payable]
    pub fn approve_config(&mut self, proposal_id: u64) {
        assert_one_yocto(); self.assert_member();
        let p = self.proposals.get_mut(&proposal_id).expect("Proposal missing");
        assert!(p.base_version == self.version && p.expires_at_ns > env::block_timestamp(), "Proposal stale");
        assert!(p.approvals.insert(env::predecessor_account_id()), "Already approved");
    }
    #[payable]
    pub fn execute_config(&mut self, proposal_id: u64) {
        assert_one_yocto(); self.assert_member();
        let p = self.proposals.get(&proposal_id).expect("Proposal missing");
        assert!(p.base_version == self.version && p.expires_at_ns > env::block_timestamp(), "Proposal stale");
        assert!(p.approvals.len() >= usize::from(self.threshold), "Current threshold not reached");
        let p = self.proposals.remove(&proposal_id).unwrap();
        self.signers = p.signers; self.threshold = p.threshold; self.policy_commitment = p.policy_commitment; self.config_hash = p.config_hash;
        self.version = self.version.checked_add(1).expect("Overflow");
        self.proposals.clear(); // Outstanding approvals never carry across a policy revision.
    }
    #[payable]
    pub fn remove_stale_proposal(&mut self, proposal_id: u64) {
        assert_one_yocto(); self.assert_member();
        let p = self.proposals.get(&proposal_id).expect("Proposal missing");
        assert!(p.base_version != self.version || p.expires_at_ns <= env::block_timestamp(), "Proposal is active");
        self.proposals.remove(&proposal_id);
    }
    /// NEP-641 OFFCHAIN view only. Never use this to authorize a chain state mutation.
    pub fn w_resolve_auth(&self, path: Vec<AccountId>, authorization: String) -> Resolution {
        assert!(path.len() <= 4 && authorization.len() <= 65_536, "Authorization too large");
        let auth: AuthBundle = near_sdk::serde_json::from_str(&authorization).expect("Invalid bundle");
        assert!(auth.payload.len() <= 8192 && auth.members.len() <= self.signers.len(), "Invalid bundle size");
        let mut seen = BTreeSet::new(); let mut pending = Vec::new();
        for member in auth.members {
            assert!(self.signers.contains(&member.account_id) && seen.insert(member.account_id.clone()), "Unauthorized or duplicate signer");
            pending.push(Pending { account_id: member.account_id, authorization: member.authorization, expect: auth.payload.clone() });
        }
        assert!(pending.len() >= usize::from(self.threshold), "Threshold not reached");
        Resolution { payload: auth.payload, pending }
    }
}
impl TreasuryPolicy {
    fn assert_member(&self) { assert!(self.signers.contains(&env::predecessor_account_id()), "Signer required"); }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::{test_utils::VMContextBuilder, testing_env, NearToken};
    fn context(who: &str, deposit: u128) {
        let mut c=VMContextBuilder::new(); c.predecessor_account_id(who.parse().unwrap()).signer_account_id(who.parse().unwrap()).attached_deposit(NearToken::from_yoctonear(deposit)).block_timestamp(1_000_000_000);
        testing_env!(c.build());
    }
    fn team() -> TreasuryPolicy {
        context("alice.testnet",0);
        TreasuryPolicy::new("team".into(),vec!["alice.testnet".parse().unwrap(),"bob.testnet".parse().unwrap(),"carol.testnet".parse().unwrap()],2,"a".repeat(64),"b".repeat(64))
    }
    #[test] fn individual_default() {
        context("alice.testnet",0); let t=TreasuryPolicy::new("individual".into(),vec!["alice.testnet".parse().unwrap()],1,"a".repeat(64),"b".repeat(64)); assert_eq!(t.get_config().threshold,1);
    }
    #[test] #[should_panic(expected="Contract cannot be its own signer")] fn rejects_self_governance_lockout() {
        let mut c=VMContextBuilder::new(); c.current_account_id("contract.testnet".parse().unwrap()).predecessor_account_id("contract.testnet".parse().unwrap()).signer_account_id("contract.testnet".parse().unwrap()); testing_env!(c.build());
        TreasuryPolicy::new("individual".into(),vec!["contract.testnet".parse().unwrap()],1,"a".repeat(64),"b".repeat(64));
    }
    #[test] fn team_update_requires_existing_threshold() {
        let mut t=team(); context("alice.testnet",1); let id=t.propose_config(t.signers.clone(),3,"c".repeat(64),"d".repeat(64),"2000000000".into());
        context("bob.testnet",1); t.approve_config(id); t.execute_config(id); assert_eq!(t.threshold,3); assert_eq!(t.version,2); assert!(t.proposals.is_empty());
    }
    #[test] #[should_panic(expected="Current threshold not reached")] fn rejects_single_approval() {
        let mut t=team(); context("alice.testnet",1); let id=t.propose_config(t.signers.clone(),3,"c".repeat(64),"d".repeat(64),"2000000000".into()); t.execute_config(id);
    }
    #[test] #[should_panic(expected="Already approved")] fn rejects_duplicate_approval() {
        let mut t=team(); context("alice.testnet",1); let id=t.propose_config(t.signers.clone(),3,"c".repeat(64),"d".repeat(64),"2000000000".into()); t.approve_config(id);
    }
    #[test] #[should_panic(expected="Signer required")] fn rejects_outsider() { let mut t=team(); context("outsider.testnet",1); t.approve_config(0); }
    #[test] #[should_panic(expected="Proposal stale")] fn rejects_expired() {
        let mut t=team(); context("alice.testnet",1); let id=t.propose_config(t.signers.clone(),3,"c".repeat(64),"d".repeat(64),"2000000000".into());
        let mut c=VMContextBuilder::new(); c.predecessor_account_id("bob.testnet".parse().unwrap()).attached_deposit(NearToken::from_yoctonear(1)).block_timestamp(2_000_000_000); testing_env!(c.build()); t.approve_config(id);
    }
    #[test] #[should_panic(expected="Unauthorized or duplicate signer")] fn rejects_duplicate_auth_member() {
        let t=team(); t.w_resolve_auth(vec![],r#"{"payload":"x","members":[{"account_id":"alice.testnet","authorization":"a"},{"account_id":"alice.testnet","authorization":"b"}]}"#.into());
    }
}

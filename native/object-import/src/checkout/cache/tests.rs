use super::State;
use std::path::Path;
#[test]
fn separates_repositories_and_replaces_duplicate_entries() {
    let directory = std::env::temp_dir();
    let other = directory.join("other");
    let mut state = State::default();
    state.insert(&directory, [1; 20], b"first".to_vec());
    state.insert(&directory, [1; 20], b"replacement".to_vec());
    assert_eq!(state.get(&directory, [1; 20]).unwrap(), b"replacement");
    assert!(state.get(&other, [1; 20]).is_none());
    assert_eq!(state.sources.len(), 1);
}
#[test]
fn empty_sources_and_large_keys_cannot_grow_unbounded() {
    let directory = std::env::temp_dir();
    let mut state = State::default();
    for index in 0..4097_u32 {
        let mut hash = [0; 20];
        hash[..4].copy_from_slice(&index.to_be_bytes());
        state.insert(&directory, hash, Vec::new());
    }
    assert_eq!(state.sources.len(), 1);
    assert!(state.bytes <= super::MAX_BYTES);
    let large_key = "a".repeat(super::MAX_BYTES);
    state.insert(Path::new(&large_key), [2; 20], Vec::new());
    assert_eq!(state.sources.len(), 1);
}
#[test]
fn evicts_before_exceeding_byte_budget_and_never_retains_oversize_sources() {
    let directory = std::env::temp_dir();
    let mut state = State::default();
    state.insert(&directory, [1; 20], vec![1; 20 * 1024 * 1024]);
    state.insert(&directory, [2; 20], vec![2; 20 * 1024 * 1024]);
    assert!(state.get(&directory, [1; 20]).is_none());
    assert!(state.get(&directory, [2; 20]).is_some());
    state.insert(&directory, [3; 20], vec![3; super::MAX_BYTES + 1]);
    assert!(state.get(&directory, [3; 20]).is_none());
    assert!(state.bytes <= super::MAX_BYTES);
}

#[test]
fn retains_sources_at_the_exact_raw_byte_budget() {
    let directory = std::env::temp_dir();
    let mut state = State::default();
    state.insert(&directory, [1; 20], vec![1; super::MAX_BYTES]);
    assert_eq!(
        state
            .get(&directory, [1; 20])
            .unwrap()
            .len(),
        super::MAX_BYTES,
    );
    assert_eq!(state.bytes, super::MAX_BYTES);
    assert!(state.key_bytes <= 4 * 1024 * 1024);
}

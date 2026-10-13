use super::{MAX_BYTES, MAX_FILES, MAX_TOKEN, Observation, State};
use std::path::PathBuf;

fn snapshot(bytes: usize) -> Observation {
    Observation {
        path: PathBuf::from("workspace/file"),
        raw_hash: "a".repeat(40),
        snapshot_hash: "b".repeat(40),
        raw_bytes: bytes,
        contents: vec![0; bytes].into(),
    }
}

#[test]
fn ownership_requires_the_exact_read_token_path_and_disk_identity() {
    let original = snapshot(7);
    let mut state = State::default();
    let token = state.retain(original.clone()).unwrap();
    assert!(state.get(token, &original.path, &original.raw_hash).is_some());
    assert!(
        state
            .get(token + 1, &original.path, &original.raw_hash)
            .is_none(),
    );
    assert!(
        state
            .get(token, &original.path.join("other"), &original.raw_hash)
            .is_none(),
    );
    assert!(state.get(token, &original.path, &original.snapshot_hash).is_none());
    assert!(State::default().get(token, &original.path, &original.raw_hash).is_none());
}

#[test]
fn snapshots_evict_oldest_observations_at_both_limits() {
    let original = snapshot(MAX_BYTES / 2 + 1);
    let mut state = State::default();
    let first = state.retain(original.clone()).unwrap();
    let second = state.retain(original.clone()).unwrap();
    assert!(state.get(first, &original.path, &original.raw_hash).is_none());
    assert!(state.get(second, &original.path, &original.raw_hash).is_some());
    let empty = snapshot(0);
    for _ in 0..MAX_FILES {
        state.retain(empty.clone()).unwrap();
    }
    assert!(state.get(second, &original.path, &original.raw_hash).is_none());
    assert_eq!(state.bytes, 0);
    assert_eq!(state.records.len(), MAX_FILES);
}

#[test]
fn token_exhaustion_declines_without_reusing_an_observation_identity() {
    let mut state = State { next: MAX_TOKEN - 1, ..State::default() };
    assert_eq!(state.retain(snapshot(0)), Some(MAX_TOKEN));
    assert_eq!(state.retain(snapshot(0)), None);
    assert_eq!(state.records.len(), 1);
}

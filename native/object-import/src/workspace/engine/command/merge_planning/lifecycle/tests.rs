use super::{Prepared, merge};
use crate::workspace::engine::command::scratch;
use serde_json::json;
use std::fs;

#[test]
fn empty_merge_still_invokes_repository_persistence_notification() {
    let root = scratch::Directory::create().unwrap();
    let mut prepared = Prepared {
        state: merge::State::new(0).unwrap(),
        materials: Vec::new(),
        unmerged: json!([]),
        proofs: Vec::new(),
        pending: Vec::new(),
        finalized: None,
        fast_forward: None,
    };
    assert_eq!(prepared.finish_snap(&root.0).unwrap(), 1);
    assert_eq!(fs::read(root.0.join(".bit/events/onPostObjectsPersist")).unwrap(), b"");
    assert!(!root.0.join(".bit/unmerged.json").exists());
}

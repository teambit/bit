//! Unit tests for [`Prepared`] [`merge`] lifecycle persistence notifications on empty merges.
//!
//! Verifies that empty merge executions in [`scratch`] workspaces still trigger `onPostObjectsPersist` without writing `unmerged.json`.

use super::{Prepared, merge};
use crate::workspace::engine::command::scratch;
use serde_json::json;
use std::fs;

/// Verifies that an empty [`Prepared`] [`merge`] still emits `onPostObjectsPersist` in [`scratch`] without creating `.bit/unmerged.json`.
#[test]
fn empty_merge_still_invokes_repository_persistence_notification() {
    let root = scratch::Directory::create().unwrap();
    let mut prepared = Prepared {
        policy: None,
        publication: super::super::Publication {
            lane: None,
            fast_forward: None,
            removed: Vec::new(),
        },
        state: merge::State::new(0).unwrap(),
        materials: Vec::new(),
        unmerged: json!([]),
        proofs: Vec::new(),
        pending: Vec::new(),
        finalized: None,
    };
    assert_eq!(prepared.persist_first(&root.0).unwrap(), 1);
    assert_eq!(prepared.finish_snap(&root.0).unwrap(), 0);
    assert_eq!(fs::read(root.0.join(".bit/events/onPostObjectsPersist")).unwrap(), b"");
    assert!(!root.0.join(".bit/unmerged.json").exists());
}

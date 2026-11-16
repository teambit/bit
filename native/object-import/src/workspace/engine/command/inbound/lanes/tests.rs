//! Unit tests for inbound lane ID [`parse_id`], [`validate_virtual_bounds`], and [`VirtualRemote`] [`merge_remote`] merging ([`lane_ids_must_be_distinct_and_non_main`], [`same_scope_lanes_share_identical_objects_only`]).
//!
//! Checks distinct non-main lane ID validation and conflict-free virtual remote object merging in `bit-object-import`.

use super::{merge_remote, parse_id, validate_virtual_bounds};
use crate::command_import::VirtualRemote;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
};

/// Verifies that [`parse_id`] accepts distinct `scope/lane` IDs in [`HashSet`] and rejects duplicates, `main`, or unscoped names.
#[test]
fn lane_ids_must_be_distinct_and_non_main() {
    let mut seen = HashSet::new();
    assert!(parse_id("scope/feature", &mut seen).is_ok());
    assert!(parse_id("scope/feature", &mut seen).is_err());
    assert!(parse_id("scope/main", &mut seen).is_err());
    assert!(parse_id("feature", &mut seen).is_err());
}

/// Verifies that [`merge_remote`] and [`validate_virtual_bounds`] deduplicate identical [`VirtualRemote`] objects per scope in [`HashMap`] ([`PathBuf`]) and reject conflicting payloads ([`lane_ids_must_be_distinct_and_non_main`]).
#[test]
fn same_scope_lanes_share_identical_objects_only() {
    let remote =
        |objects| VirtualRemote { scope: "scope".into(), path: PathBuf::from("/scope"), objects };
    let mut remotes = HashMap::new();
    merge_remote(&mut remotes, remote(vec![("a".into(), vec![1])])).unwrap();
    merge_remote(&mut remotes, remote(vec![("a".into(), vec![1]), ("b".into(), vec![2])])).unwrap();
    assert_eq!(remotes["scope"].objects.len(), 2);
    assert!(validate_virtual_bounds(&remotes).is_ok());
    assert!(merge_remote(&mut remotes, remote(vec![("a".into(), vec![3])])).is_err());
}

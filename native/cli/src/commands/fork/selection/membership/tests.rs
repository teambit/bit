//! Unit tests for `bit fork` local and remote component membership classification via [`classify`].
//!
//! Verifies local-before-remote ordering and reversed remote candidate preservation across [`classify`].

use super::classify;
use serde_json::json;
/// Verifies that [`classify`] orders local matches before reversed remote matches when [`json`] candidate versions match.
#[test]
fn equal_remote_matches_repeat_in_local_phase_before_reversed_remote_phase() {
    let local = vec!["old.scope/comp1".into(), "old.scope/comp2".into()];
    let remote = vec!["old.scope/comp1@0.0.1".into(), "old.scope/comp2@0.0.1".into()];
    let pool = vec![
        json!({"identity":"old.scope/comp1","version":"0.0.1"}),
        json!({"identity":"old.scope/comp2","version":"0.0.1"}),
    ];
    let (locals, remotes) = classify(&local, &remote, &pool);
    assert_eq!(
        locals,
        ["old.scope/comp1", "old.scope/comp2", "old.scope/comp1", "old.scope/comp2"],
    );
    assert_eq!(
        remotes,
        [
            "old.scope/comp2@0.0.1",
            "old.scope/comp1@0.0.1",
            "old.scope/comp2@0.0.1",
            "old.scope/comp1@0.0.1",
        ],
    );
}
/// Verifies that [`classify`] treats differing component versions as distinct IDs.
#[test]
fn different_versions_are_not_equal_component_ids() {
    let local = vec!["old.scope/comp1".into()];
    let remote = vec!["old.scope/comp1@0.0.2".into()];
    let pool = vec![json!({"identity":"old.scope/comp1","version":"0.0.1"})];
    let (locals, remotes) = classify(&local, &remote, &pool);
    assert_eq!(locals, local);
    assert_eq!(remotes, remote);
}

/// Verifies that [`classify`] returns empty local and remote vectors when all inputs are empty.
///
/// Confirms empty candidate pools produce `(vec![], vec![])`.
#[test]
fn empty_local_and_remote_inputs_produce_empty_classifications() {
    let (locals, remotes) = classify(&[], &[], &[]);
    assert!(locals.is_empty());
    assert!(remotes.is_empty());
}

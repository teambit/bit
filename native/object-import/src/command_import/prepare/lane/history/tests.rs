//! Unit tests for `LaneHistory` entry merging ([`merge_history`]) during lane refresh in
//! `bit-object-import` lane synchronization ([`refresh_overwrites_entries_in_place_and_keeps_existing_history_metadata`], [`incoming_history_for_another_stable_lane_is_rejected`]).

use super::merge_history;
use serde_json::json;

/// Verifies that [`merge_history`] overwrites matching `history` keys in place while preserving existing `name` and `scope` metadata ([`incoming_history_for_another_stable_lane_is_rejected`]).
#[test]
fn refresh_overwrites_entries_in_place_and_keeps_existing_history_metadata() {
    let hash = "a".repeat(40);
    let existing = json!({"name":"old-name","scope":"old-scope","laneHash":hash,"history":{"first":{"components":["s/a@old"]},"second":{"components":[]}}});
    let incoming = json!({"name":"remote-name","scope":"remote-scope","laneHash":hash,"history":{"first":{"components":["s/a@new"]},"third":{"components":[]}}});
    let merged = merge_history(Some(existing), incoming, &hash).unwrap();
    assert_eq!(merged["name"], "old-name");
    assert_eq!(merged["scope"], "old-scope");
    assert_eq!(
        merged["history"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect::<Vec<_>>(),
        vec!["first", "second", "third"],
    );
    assert_eq!(merged["history"]["first"]["components"][0], "s/a@new");
}
/// Verifies that [`merge_history`] rejects an incoming `LaneHistory` payload whose `laneHash` differs from the expected lane hash ([`refresh_overwrites_entries_in_place_and_keeps_existing_history_metadata`]).
#[test]
fn incoming_history_for_another_stable_lane_is_rejected() {
    let incoming = json!({"laneHash":"b".repeat(40),"history":{}});
    assert!(merge_history(None, incoming, &"a".repeat(40)).is_err());
}

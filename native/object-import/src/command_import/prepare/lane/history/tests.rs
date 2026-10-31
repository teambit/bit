use super::merge_history;
use serde_json::json;

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
#[test]
fn incoming_history_for_another_stable_lane_is_rejected() {
    let incoming = json!({"laneHash":"b".repeat(40),"history":{}});
    assert!(merge_history(None, incoming, &"a".repeat(40)).is_err());
}

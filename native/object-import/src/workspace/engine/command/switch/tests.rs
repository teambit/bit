use super::{
    command_import::lane::{Id, Record},
    lane_only, progress, validate_lane,
};
use serde_json::json;
use std::path::Path;

#[test]
fn forked_lane_provenance_does_not_change_checkout_eligibility() {
    let id = Id { scope: "scope".into(), name: "child".into() };
    let mut lane = Record {
        hash: "a".repeat(40),
        is_new: true,
        value: json!({"forkedFrom":{"scope":"scope","name":"parent"},"components":[]}),
    };
    validate_lane(&id, Some(&lane)).unwrap();
    lane.value["updateDependents"] = json!([{"id":"scope/comp"}]);
    assert!(validate_lane(&id, Some(&lane)).is_err());
}

#[test]
fn unavailable_lane_only_bitmap_rows_remain_tracked_for_later_switches() {
    let ids = lane_only(&json!({"comp":{"scope":"scope","name":"comp",
        "onLanesOnly":true,"isAvailableOnCurrentLane":false}}))
    .unwrap();
    assert!(ids.contains("scope/comp"));
}

#[test]
fn checkout_import_counts_selected_cached_ids_and_additions_not_entire_lane() {
    let context = json!({"lane":{"switchFetched":true,"switchLaneHeads":{
        "scope/a":"a","scope/b":"b"},"addedTargets":[{"identity":"scope/b"}]}});
    let count = progress::import_count(Path::new("/unused"), &context, &[]).unwrap();
    assert_eq!(count, 1);
    assert_eq!(progress::receipt(count)["performed"], true);
    assert_eq!(progress::receipt(0)["performed"], false);
}

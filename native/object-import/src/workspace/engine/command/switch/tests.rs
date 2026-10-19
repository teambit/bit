use super::{
    command_import::lane::{Entry, Id, Record},
    lane_only,
    load_order::{order_targets, status_load_order},
    progress, validate_lane,
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

#[test]
fn checkout_callback_loads_main_only_then_stored_lane_order() {
    let context = json!({"targets":[
        {"identity":"scope/main-only"},
        {"identity":"scope/component"},
        {"identity":"scope/env"}
    ]});
    let lane = ["scope/env", "scope/component"].map(|identity| Entry {
        identity: identity.into(),
        head: "a".repeat(40),
        hidden: false,
    });
    assert_eq!(
        status_load_order(&context, &lane).unwrap(),
        ["scope/main-only", "scope/env", "scope/component",],
    );
}

#[test]
fn checkout_target_records_follow_the_published_status_order() {
    let mut context = json!({"targets":[
        {"identity":"scope/comp1","marker":1},
        {"identity":"scope/env","marker":2}
    ]});
    let order = ["scope/env".to_owned(), "scope/comp1".to_owned()];
    order_targets(&mut context, &order).unwrap();
    assert_eq!(context["targets"][0]["marker"], 2);
    assert_eq!(context["targets"][1]["marker"], 1);
    assert!(
        order_targets(&mut context, &["scope/comp1".to_owned(), "scope/other".to_owned()]).is_err(),
    );
}

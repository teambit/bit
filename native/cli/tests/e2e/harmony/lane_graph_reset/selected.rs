//! Selected component pattern reset tests for `bit reset` on a lane ([`selected_introduced_member_leaves_the_other_lane_member_and_main_versions_intact`]).
//!
//! Covers partial lane resets, `--head` on introduced members, and snapped deletion restoration.

use super::fixture;
use crate::{commands::move_paths::support, helper::remote};

/// Verifies that resetting a single lane component removes it from the lane while keeping other members intact.
#[test]
fn selected_introduced_member_leaves_the_other_lane_member_and_main_versions_intact() {
    let helper = fixture::workspace(2, true);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "--unmodified");
    let keep = fixture::head(&helper, "dev", "comp2");
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset comp1 --silent");
    let lane = support::json(&helper, "lane show dev --json");
    let members = lane["components"].as_array().unwrap();
    assert_eq!(members.len(), 1);
    assert!(
        members[0]["id"]
            .as_str()
            .unwrap()
            .ends_with("/comp2"),
    );
    assert_eq!(fixture::head(&helper, "dev", "comp2"), keep);
    fixture::unchanged(&files);
    fixture::version(&helper, "comp1", "0.0.1");
    fixture::version(&helper, "comp2", "0.0.1");
}

/// Verifies that `bit reset comp1 --head` keeps the `main` parent version as a member of the lane.
#[test]
fn head_only_introduced_member_keeps_the_main_parent_as_a_lane_member() {
    let helper = fixture::workspace(1, true);
    remote::publish(&helper);
    let main = fixture::version(&helper, "comp1", "0.0.1");
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "--unmodified");
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset comp1 --head --silent");
    let lane = support::json(&helper, "lane show dev --json");
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let head = fixture::head(&helper, "dev", "comp1");
    assert_eq!(fixture::version(&helper, "comp1", &head), main);
    let bitmap = support::bitmap(&helper);
    assert_eq!(fixture::bitmap_row(&bitmap, "comp1")["version"], "0.0.1");
    fixture::unchanged(&files);
}

#[test]
fn resetting_a_snapped_lane_deletion_restores_the_exact_bitmap_removal_configuration() {
    let helper = fixture::workspace(2, true);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "--unmodified");
    remote::publish(&helper);
    support::setup(&helper, "delete comp1 --silent --lane");
    let before = support::bitmap(&helper);
    fixture::snap(&helper, "--unmodified");
    let output = fixture::successful(&helper, "reset --silent");
    assert!(output.stdout.contains("2 component(s) reset successfully"));
    let bitmap = support::bitmap(&helper);
    let old = fixture::bitmap_row(&before, "comp1");
    let new = fixture::bitmap_row(&bitmap, "comp1");
    assert_eq!(new, old);
    let status = support::json(&helper, "status --json");
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

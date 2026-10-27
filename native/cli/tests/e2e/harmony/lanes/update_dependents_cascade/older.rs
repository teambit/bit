//! Upstream cascade regression: hidden dependencies may refer to older lane snapshots.
mod parity;

use crate::helper::{Helper, parse};
use serde_json::Value;

/// - `local snap cascades updateDependents on the lane › scenario 22: cascade into a hidden entry that depends on an older version of the snapped component › should snap the hidden entry`
/// - `local snap cascades updateDependents on the lane › scenario 22: cascade into a hidden entry that depends on an older version of the snapped component › the hidden entry should depend on the new head of the snapped component`
#[test]
fn older_hidden_dependency_cascades_to_the_new_lane_head() {
    let helper = fixture(false);
    let before = parse(&helper.native("cat-lane dev"));
    snap(&helper, "snap comp3 --skip-auto-snap --unmodified --skip-tests");
    snap(&helper, "snap comp3 --unmodified --skip-tests");
    let lane = parse(&helper.native("cat-lane dev"));
    let after = hidden(&lane, "comp2");
    assert_ne!(after, hidden(&before, "comp2"));
    let head = helper.get_head_from_lane("dev", "comp3");
    assert_dependency(&helper, after, "comp3", &head);
    assert!(
        !helper
            .read_bit_map()
            .as_object()
            .unwrap()
            .contains_key("comp2"),
    );
}

#[test]
fn older_hidden_dependency_cascades_transitively_without_becoming_visible() {
    let helper = fixture(true);
    let before = parse(&helper.native("cat-lane dev"));
    snap(&helper, "snap comp3 --skip-auto-snap --unmodified --skip-tests");
    snap(&helper, "snap comp3 --unmodified --skip-tests");
    let lane = parse(&helper.native("cat-lane dev"));
    let second = hidden(&lane, "comp2");
    let first = hidden(&lane, "comp1");
    assert_ne!(second, hidden(&before, "comp2"));
    assert_ne!(first, hidden(&before, "comp1"));
    assert_dependency(&helper, second, "comp3", &helper.get_head_from_lane("dev", "comp3"));
    assert_dependency(&helper, first, "comp2", second.rsplit_once('@').unwrap().1);
    let bitmap = helper.read_bit_map();
    assert!(
        !bitmap
            .as_object()
            .unwrap()
            .contains_key("comp1"),
    );
    assert!(
        !bitmap
            .as_object()
            .unwrap()
            .contains_key("comp2"),
    );
}

fn fixture(transitive: bool) -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("tag --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp3 --skip-auto-snap --unmodified --skip-tests");
    helper.native("export");
    let remote = &helper.scopes.remote;
    helper.seed_hidden_update_dependent(&format!("{remote}/comp2"), &format!("{remote}/dev"));
    if transitive {
        helper.seed_hidden_update_dependent(&format!("{remote}/comp1"), &format!("{remote}/dev"));
    }
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {remote}/dev -x"));
    helper
}

fn snap(helper: &Helper, command: &str) {
    let run = helper.native_run(command);
    assert!(run.status.success(), "{run:?}");
    assert!(run.trace.contains("engine commandSnapApply"), "{run:?}");
}

fn hidden<'a>(lane: &'a Value, name: &str) -> &'a str {
    lane["updateDependents"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .find(|id| {
            id.split('@')
                .next()
                .unwrap()
                .ends_with(&format!("/{name}"))
        })
        .unwrap()
}

fn assert_dependency(helper: &Helper, component: &str, name: &str, head: &str) {
    let version = parse(&helper.native(&format!("cat-component {component} --json")));
    let dependency = version["dependencies"]
        .as_array()
        .unwrap()
        .iter()
        .find(|dep| dep["id"]["name"] == name)
        .unwrap();
    assert_eq!(dependency["id"]["version"], head);
}

//! `e2e/harmony/lanes/lane-merge.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, parse, remote};
use std::path::PathBuf;

fn setup_exported_lane_and_switch_to_main() -> (Helper, PathBuf, PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    remote::publish(&helper);
    helper.native("lane create dev");
    helper.populate_components(2, true, "v2");
    helper.native("snap -m s1");
    remote::publish(&helper);
    helper.native("switch main -x");
    let local_clone = helper.clone_workspace();
    let remote_clone = helper.clone_remote_scope();
    (helper, local_clone, remote_clone)
}

/// bit lane merge operations › export the lane, then switch back to main › switch the lane back to dev / switch back to main
/// bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane is ahead (no diverge)
#[test]
fn switch_between_main_and_dev_and_merge_ahead_lane() {
    let (helper, after_switching_local, _) = setup_exported_lane_and_switch_to_main();
    assert!(helper.native("status").contains("nothing to tag or export"));

    helper.native("switch dev -x");
    let bitmap_dev = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let head = helper.head_of_lane("dev", "comp1");
    assert_eq!(bitmap_dev["comp1"]["version"].as_str(), Some(head.as_str()));

    helper.native("switch main -x");
    let bitmap_main = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap_main["comp1"]["version"].as_str(), Some("0.0.1"));
    assert!(helper.native("status").contains("nothing to tag or export"));

    helper.get_cloned_workspace(&after_switching_local);
    helper.native("lane merge dev -x");
    assert!(helper.native("lane list --merged").contains("dev"));
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );

    helper.run("import -x");
    let status_after = parse(&helper.native("status --json"));
    assert_eq!(
        status_after["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status_after["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );

    helper.native("tag --unmodified -m v2");
    remote::publish(&helper);
}

/// bit lane merge operations › export the lane, then switch back to main › merging the dev lane when the lane has diverged from main
#[test]
fn merge_dev_lane_when_diverged_from_main() {
    let (helper, after_switching_local, after_switching_remote) =
        setup_exported_lane_and_switch_to_main();
    helper.get_cloned_workspace(&after_switching_local);
    helper.restore_remote_scope(&after_switching_remote);
    helper.populate_components(2, true, "v3");
    helper.native("snap -m s2");
    helper.native("lane merge dev --auto-merge-resolve ours --no-squash -x");

    assert!(helper.native("lane list --merged").contains("dev"));
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );

    helper.native("tag --unmodified -m v2");
    remote::node_export(&helper);
}

/// bit lane merge operations › branching out when a component is checked out to an older version
/// bit lane merge operations › head on the lane is not in the filesystem
#[test]
fn branching_out_from_older_version_and_head_not_in_filesystem() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag -m v1");
    helper.create_component_bar_foo("module.exports = function foo() { return 'got foo v2'; };");
    helper.native("tag -m v2");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/bar/foo@0.0.1 -x", helper.scopes.remote));
    helper.native("lane create dev");
    helper.output_file(
        &format!("{}/bar/foo/foo.js", helper.scopes.remote),
        "module.exports = function foo() { return 'got foo v3'; };",
    );
    helper.run("snap -m s1");
    helper.native("switch main -x");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["bar/foo"]["version"].as_str(), Some("0.0.2"));
    let main_status = parse(&helper.native("status --json"));
    assert!(
        main_status["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        main_status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        main_status["newComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        main_status["outdatedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );

    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, false, "");
    helper.native("snap -m s1");
    remote::publish(&helper);
    helper.native("snap --unmodified -m s2");
    helper.delete_path(".bit");
    helper.native("init");
    helper.add_remote_scope();
    helper.run("status");
}

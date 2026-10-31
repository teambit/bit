//! `e2e/harmony/lanes/lane-export.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, len, parse};
use std::fs;

/// bit lane export operations › exporting the lane
#[test]
fn exporting_the_lane_and_importing_component() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("lane create dev");
    helper.create_component_bar_foo("module.exports = function foo() { return 'got foo v2'; };");
    helper.native("snap -m s2");
    helper.native("export");

    let remote_list = parse(&helper.native(&format!("list {} --json", helper.scopes.remote)));
    assert_eq!(len(&remote_list), 1);
    let status = parse(&helper.native("status --json"));
    assert_eq!(len(&status["stagedComponents"]), 0);
    assert_eq!(len(&status["modifiedComponents"]), 0);

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["id"]["name"].as_str(), Some("dev"));
    assert_eq!(bitmap["_bit_lane"]["id"]["scope"].as_str(), Some(helper.scopes.remote.as_str()));

    let remote_lanes =
        parse(&helper.native(&format!("lane list --remote {} --json", helper.scopes.remote)));
    assert_eq!(len(&remote_lanes["lanes"]), 1);
    assert_eq!(remote_lanes["lanes"][0]["name"].as_str(), Some("dev"));

    helper.native(&format!("import {}/bar/foo -x", helper.scopes.remote));
    let bitmap_after = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(bitmap_after["bar/foo"].get("onLanesOnly").is_none());
}

/// bit lane export operations › exporting a lane to a different scope than the component scope
/// bit lane export operations › tag on main, export, create lane and snap
/// bit lane export operations › export on main then on a lane
#[test]
fn export_lane_different_scope_and_staged_versions_and_clone() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("snap -m s1");
    helper.native("export");
    let (other_name, _) = helper.new_bare_scope_connected();
    helper.native("lane create dev");
    helper.native(&format!("lane change-scope {other_name}"));
    helper.output_file("comp1/comp1.spec.js", "");
    helper.native("snap -m s2");
    helper.native("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/comp1 -x", helper.scopes.remote));
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.populate_components(2, true, "v2");
    helper.native("snap -m s1");
    let status = helper.native("status --verbose");
    let hash = helper.head_of_lane("dev", "comp1");
    assert!(status.contains(&format!("versions: {hash}")), "{status}");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    helper.native("export");
    let scope_json = fs::read_to_string(helper.scopes.local_path.join(".bit/scope.json")).unwrap();
    helper.delete_path(".bit");
    helper.native("init");
    fs::write(helper.scopes.local_path.join(".bit/scope.json"), scope_json).unwrap();
    helper.run("import -x");
    assert!(!helper.native("status").contains("import-pending"));
}

/// bit lane export operations › export when previous versions have deleted dependencies
/// bit lane export operations › export on lane with tiny cache
/// bit lane export operations › export multiple snaps on lane when the remote has it already
#[test]
fn export_with_deleted_deps_tiny_cache_and_multiple_snaps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    let del_remote = Helper::cmd_in_with(
        &helper.scopes.local_path,
        &format!("delete {}/comp3 --silent --hard --force", helper.scopes.remote),
        &[("BIT_FEATURES", std::ffi::OsStr::new("hard-delete"))],
    );
    assert!(del_remote.status.success(), "{del_remote:?}");
    helper.native("remove comp3 --force --silent");
    helper.output_file("comp2/index.js", "");
    helper.native("tag -m v2");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified -m s1");
    helper.native("export");

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("snap --unmodified -m s2");
    helper.native("snap --unmodified -m s3");
    helper.native("export");
}

/// bit lane export operations › export interrupted, reset, snap then import
#[test]
fn export_interrupted_reset_snap_then_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("snap --unmodified -m s2");

    let before_export = helper.clone_workspace();
    helper.native("export");

    helper.get_cloned_workspace(&before_export);
    helper.native("reset --all");
    helper.native("snap --unmodified -m s2-alt");
    helper.run("import -x");

    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert!(!helper.cmd("export").status.success());

    helper.native("reset --all");
    helper.native("checkout head -x");
    helper.native("snap --unmodified -m s3");
    helper.native("export");
}

//! `e2e/harmony/lanes/switch-lanes.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, parse, strip_ansi};
use std::fs;

const FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; };";
const FOO_V3: &str = "module.exports = function foo() { return 'got foo v3'; };";

/// bit lane command › switching lanes › importing the lane objects and switching to that lane
#[test]
fn switch_to_remote_lane_diff_snap_alias_and_local_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("snap -m s1");
    helper.run("export");
    helper.native("lane create dev");
    helper.create_component_bar_foo(FOO_V2);
    helper.run("snap -m s2");
    helper.run("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    let before_switch = helper.clone_workspace();
    helper.run(&format!("switch {}/dev -x", helper.scopes.remote));

    let foo_path = helper.scopes.local_path.join(&helper.scopes.remote).join("bar/foo/foo.js");
    assert_eq!(fs::read_to_string(&foo_path).unwrap(), FOO_V2);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["_bit_lane"]["id"]["name"].as_str(), Some("dev"));
    let lane = parse(&helper.native("lane show dev --json"));
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(parse(&helper.native("lane list --json"))["currentLane"].as_str(), Some("dev"));

    fs::write(&foo_path, FOO_V3).unwrap();
    let diff = strip_ansi(&helper.native("diff"));
    assert!(diff.contains("-module.exports = function foo() { return 'got foo v2'; };"), "{diff}");
    assert!(diff.contains("+module.exports = function foo() { return 'got foo v3'; };"), "{diff}");
    assert!(!diff.contains("-module.exports = function foo() { return 'got foo'; }"), "{diff}");

    helper.run("snap -m s3");
    let status_after = parse(&helper.native("status --json"));
    assert_eq!(
        status_after["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let local_snap = helper.head_of_lane("dev", "bar/foo");
    assert!(helper.native("status --verbose").contains(&local_snap));

    helper.get_cloned_workspace(&before_switch);
    helper.run(&format!("switch {}/dev --alias my-new-lane -x", helper.scopes.remote));
    assert_eq!(
        parse(&helper.native("lane show my-new-lane --json"))["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        parse(&helper.native("lane show dev --json"))["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    helper.native("lane create int");
    helper.run("switch main -x");
    helper.run("switch int -x");
    assert!(helper.native("lane current").contains("int"));
}

/// bit lane command › switching lanes with deleted files
/// bit lane command › switching lanes and importing in a new scope from remote scope
#[test]
fn switch_lanes_with_deleted_files_and_importing_in_new_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag -m v1");
    helper.run("export");
    helper.native("lane create migration");
    helper.output_file("comp1/comp1.spec.js", "");
    helper.native("add comp1/");
    helper.run("compile");
    helper.run("snap -m s1");
    helper.run("switch main -x");
    assert!(!helper.scopes.local_path.join("comp1/comp1.spec.js").exists());

    helper.set_workspace_with_remote_scope();
    let main_scope = helper.clone_workspace();
    helper.native("lane create dev");
    let lane_scope = helper.clone_workspace();

    helper.run("switch main -x");
    helper.populate_components(1, true, "");
    helper.output_file("comp2/index.js", "");
    helper.native("add comp2/");
    helper.run("tag -m v1");
    helper.run("export");

    helper.run("switch dev -x");
    helper.output_file("comp1/comp.model.js", "");
    helper.output_file("comp2/comp.model.js", "");
    helper.run("snap -m s1");
    helper.run("export");

    helper.get_cloned_workspace(&main_scope);
    helper.run(&format!("import {}/* -x", helper.scopes.remote));
    let main_list = parse(&helper.native("list --json"));
    assert_eq!(main_list.as_array().unwrap().len(), 2);
    assert!(
        main_list[0]["currentVersion"]
            .as_str()
            .unwrap()
            .contains("0.0.1"),
    );

    helper.get_cloned_workspace(&lane_scope);
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    let lane_list = parse(&helper.native("list --json"));
    assert_eq!(lane_list.as_array().unwrap().len(), 1);
    assert!(
        lane_list[0]["id"]
            .as_str()
            .unwrap()
            .contains("comp2"),
    );
    assert!(
        !lane_list[0]["currentVersion"]
            .as_str()
            .unwrap()
            .contains("0.0.1"),
    );
}

/// bit lane command › switch to main after importing a lane
/// bit lane command › switch to main after merging the lane somewhere else
/// bit lane command › switch from main to a lane when main has staged components
#[test]
fn switch_to_main_after_import_or_merge_elsewhere_and_staged_main_block() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.run("tag -m v1");
    helper.run("export");
    helper.native("lane create dev");
    helper.populate_components(1, true, "v2");
    helper.run("snap -m s1");
    helper.run("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp1 -x", helper.scopes.remote));
    helper.run(&format!("switch {}/dev -x", helper.scopes.remote));
    helper.run("switch main -x");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some("0.0.1"));
    let list = parse(&helper.native("list --json"));
    assert_eq!(list[0]["localVersion"].as_str(), Some("0.0.1"));
    assert_eq!(list[0]["currentVersion"].as_str(), Some("0.0.1"));

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("lane create dev");
    helper.run("snap -m s1");
    helper.run("export");
    let orig_ws = helper.clone_workspace();
    helper.run("switch main -x");
    helper.run("lane merge dev -x");
    helper.run("export");

    helper.get_cloned_workspace(&orig_ws);
    helper.run("switch main --skip-fetch -x");
    helper.run("import -x");
    assert_eq!(
        parse(&helper.native("list --json"))
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["unavailableOnMain"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    helper.run("checkout head -x");
    assert_eq!(
        parse(&helper.native("list --json"))
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    helper.run("tag --unmodified -m v1");
    let blocked = helper.cmd("switch dev -x");
    assert!(!blocked.status.success());
    let combined = format!("{}{}", blocked.stdout, blocked.stderr);
    assert!(
        combined.contains("please export or reset the following components first"),
        "{combined}",
    );
}

/// bit lane command › switch to main when main has updates on the remote
/// bit lane command › switch to main when main has updates on the remote and the lane is on another scope
/// bit lane command › switch to a lane when it has updates on the remote
#[test]
fn switch_fetches_remote_updates_on_main_and_lane_unless_skip_fetch() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (lane_scope, _) = helper.new_bare_scope_connected();
    helper.populate_components(1, true, "");
    helper.run("tag -m v1");
    helper.run("export");
    helper.native(&format!("lane create dev --scope {lane_scope}"));
    helper.run("snap --unmodified -m s1");
    let first_snap = helper.head_of_lane("dev", "comp1");
    helper.run("export");
    let before_updating_main = helper.clone_workspace();
    helper.run("switch main -x");
    helper.run("tag --unmodified -m v2");
    helper.run("export");

    helper.get_cloned_workspace(&before_updating_main);
    helper.run("switch main -x --skip-fetch");
    let bm_skip = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bm_skip["comp1"]["version"].as_str(), Some("0.0.1"));

    helper.get_cloned_workspace(&before_updating_main);
    helper.run("switch main -x");
    let bm_fetched = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bm_fetched["comp1"]["version"].as_str(), Some("0.0.2"));

    helper.run("lane merge dev -x");
    helper.run("export");
    let before_updating_lane = helper.clone_workspace();
    helper.run("switch dev -x");
    helper.run("snap --unmodified -m s2");
    let head_snap = helper.head_of_lane("dev", "comp1");
    helper.run("export");

    helper.get_cloned_workspace(&before_updating_lane);
    helper.run("switch dev -x --skip-fetch");
    let bm_lane_skip = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bm_lane_skip["comp1"]["version"].as_str(), Some(first_snap.as_str()));

    helper.get_cloned_workspace(&before_updating_lane);
    helper.run("switch dev -x");
    let bm_lane_fetch = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bm_lane_fetch["comp1"]["version"].as_str(), Some(head_snap.as_str()));
}

/// bit lane command › switch with --skip-fetch when the lane is not in the local scope
/// bit lane command › switch with deprecated --head flag
/// bit lane command › switch with --force-ours
/// bit lane command › switch to main when only one component was snapped on a lane
/// bit lane command › switching lanes while a component file has uncommitted local changes
#[test]
fn switch_flags_partial_lane_details_and_uncommitted_changes_protection() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag -m v1");
    helper.run("export");
    helper.native("lane create dev");
    helper.populate_components(1, true, "v2");
    helper.run("snap comp1 -m s1");
    helper.run("export");

    let switch_out = helper.run("switch main -x");
    assert!(switch_out.contains("switched 1 components"), "{switch_out}");
    assert!(switch_out.contains("1 skipped component(s)"), "{switch_out}");
    let details = helper.native("details");
    assert!(details.contains("switch skipped") && details.contains("comp2"), "{details}");

    helper.run("switch dev -x --head");
    assert!(helper.native("lane current").contains("dev"));

    helper.run("switch main -x --force-ours");
    assert_eq!(helper.native("lane current").trim(), "main");
    let content = fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    assert!(content.contains("v2"), "{content}");

    helper.native("lane create lane-b");
    helper.populate_components(1, false, "lane-b-content");
    helper.run("snap comp1 -m s-b");
    helper.run("export");
    helper.run("switch dev -x");
    let marker = "// uncommitted local edit on dev";
    helper.output_file("comp1/index.js", marker);
    let err = helper.cmd("switch lane-b -x");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("automatic merge has failed"), "{combined}");
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
        marker,
    );
    assert!(helper.native("lane current").contains("dev"));

    helper.re_init_workspace();
    helper.add_remote_scope();
    let skip_err = helper.cmd(&format!("switch {}/dev -x --skip-fetch", helper.scopes.remote));
    assert!(!skip_err.status.success());
    assert!(format!("{}{}", skip_err.stdout, skip_err.stderr).contains("--skip-fetch"));
}

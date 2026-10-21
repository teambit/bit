//! `e2e/harmony/lanes/lane-from-lane.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, parse, strip_ansi};
use serde_json::json;

/// bit lane command › main => lane-a => lane-b, so laneB branched from laneA
#[test]
fn main_to_lane_a_to_lane_b_branching_and_switching() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.output_file(
        "utils/is-type/is-type.js",
        "module.exports = function isType() { return 'got is-type'; };",
    );
    helper.native("add utils/is-type -i utils/is-type");
    helper.run("snap -m s1");
    helper.run("export");

    helper.native("lane create lane-a");
    helper.output_file(
        "utils/is-string/is-string.js",
        "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() + ' and got is-string'; };",
    );
    helper.native("add utils/is-string -i utils/is-string");
    helper.run("link --rewire");
    helper.run("compile");
    helper.run("snap -m s1");
    helper.run("export");

    helper.native("lane create lane-b");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("snap -m s1");
    let before_switching_back = helper.clone_workspace();

    let lane_a = parse(&helper.native("lane show lane-a --json"));
    assert_eq!(
        lane_a["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let lane_b = parse(&helper.native("lane show lane-b --json"));
    assert_eq!(
        lane_b["components"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let local_scope_list = parse(&helper.native("list --local-scope --json"));
    assert_eq!(
        local_scope_list
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    let switch_out = strip_ansi(&helper.run("switch lane-a -x"));
    assert!(switch_out.contains(r#"successfully set "lane-a" as the active lane"#));
    let status_a = parse(&helper.native("status --json"));
    assert_eq!(
        status_a["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert!(!helper.native("status").contains("bar/foo"));
    assert_eq!(
        parse(&helper.native("list --json"))
            .as_array()
            .unwrap()
            .len(),
        2,
    );

    helper.get_cloned_workspace(&before_switching_back);
    helper.run("switch main -x");
    assert_eq!(
        parse(&helper.native("list --json"))
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let status_main = helper.native("status");
    assert!(!status_main.contains("bar/foo") && !status_main.contains("utils/is-string"));

    helper.get_cloned_workspace(&before_switching_back);
    helper.run("switch lane-a -x");
    helper.run("switch main -x");
    assert_eq!(
        parse(&helper.native("list --json"))
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

/// bit lane command › creating a lane from main after merging another lane into main locally
/// bit lane command › snapping on lane-b when the components are checked out to lane-a snaps
#[test]
fn create_lane_from_main_after_local_merge_and_block_snap_on_foreign_lane_deps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag -m v1");
    helper.run("export");

    helper.native("lane create lane-a");
    helper.populate_components(2, true, "-v2");
    helper.run("snap -m s1");
    helper.run("export");
    let comp1_lane_a = helper.head_of_lane("lane-a", "comp1");
    let comp2_lane_a = helper.head_of_lane("lane-a", "comp2");

    helper.run("switch main -x");
    let main_before_merge = helper.clone_workspace();
    helper.run("lane merge lane-a -x");
    helper.run("lane create lane-b");
    assert_eq!(helper.head_of_lane("lane-b", "comp1"), comp1_lane_a);
    assert_eq!(helper.head_of_lane("lane-b", "comp2"), comp2_lane_a);

    helper.get_cloned_workspace(&main_before_merge);
    helper.native("lane create lane-b");
    helper.run(&format!("checkout {comp1_lane_a} comp1 -x"));
    helper.run(&format!("checkout {comp2_lane_a} comp2 -x"));
    helper.append_file("comp1/index.js", "\n// modified on lane-b");
    let snap_run = helper.cmd("snap comp1");
    assert!(!snap_run.status.success());
    let combined = format!("{}{}", snap_run.stdout, snap_run.stderr);
    assert!(
        combined.contains(r#"which is not part of current lane "lane-b" history"#),
        "{combined}",
    );
}

/// bit lane command › creating lane-b from lane-a when lane-a is out-of-date
/// bit lane command › creating a lane from a lane when it has staged components
/// bit lane command › fork a lane when the default-scope is different than the original lane's scope
#[test]
fn create_lane_from_out_of_date_or_staged_or_different_default_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create lane-a");
    helper.populate_components(1, false, "");
    helper.run("snap -m s1");
    let first_snap = helper.head_of_lane("lane-a", "comp1");
    helper.run("export");
    let out_of_date_state = helper.clone_workspace();

    helper.populate_components(1, false, "v2");
    helper.run("snap -m s2");
    let second_snap = helper.head_of_lane("lane-a", "comp1");
    helper.native("lane create lane-staged");
    assert_eq!(helper.head_of_lane("lane-staged", "comp1"), second_snap);

    helper.run("switch lane-a -x");
    helper.run("export");

    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!("some-scope"),
    );
    helper.native("lane create lane-diff-scope");
    let lane_show = parse(&helper.native("lane show lane-diff-scope --json"));
    assert_eq!(lane_show["id"]["scope"].as_str(), Some(helper.scopes.remote.as_str()));

    helper.get_cloned_workspace(&out_of_date_state);
    helper.run("import -x");
    let status = parse(&helper.run("status --json"));
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    helper.native("lane create lane-b");
    let head_on_lane_b = helper.head_of_lane("lane-b", "comp1");
    assert_eq!(head_on_lane_b, first_snap);
    assert_ne!(head_on_lane_b, second_snap);
}

/// bit lane command › creating a lane when the current lane has diverged from the remote
#[test]
fn create_lane_when_current_lane_diverged_from_remote() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, false, "");
    helper.run("snap -m s1");
    helper.run("export");
    let ws1_state = helper.clone_workspace();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("switch {}/dev -x", helper.scopes.remote));
    helper.populate_components(1, false, "v2-from-ws2");
    helper.run("snap -m s2-ws2");
    helper.run("export");

    helper.get_cloned_workspace(&ws1_state);
    helper.populate_components(1, false, "v2-from-ws1");
    helper.run("snap -m s2-ws1");
    let local_snap = helper.head_of_lane("dev", "comp1");

    helper.native("lane create dev-v2");
    assert_eq!(helper.head_of_lane("dev-v2", "comp1"), local_snap);

    helper.run("switch dev -x");
    assert_eq!(helper.head_of_lane("dev", "comp1"), local_snap);
    let status_before = parse(&helper.run("status --json"));
    assert_eq!(
        status_before["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );

    helper.run("import -x");
    let status_after = parse(&helper.run("status --json"));
    assert_eq!(
        status_after["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

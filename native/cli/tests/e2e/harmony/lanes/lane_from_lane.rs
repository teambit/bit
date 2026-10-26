//! `e2e/harmony/lanes/lane-from-lane.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, len, parse, strip_ansi};
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
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("lane create lane-a");
    helper.output_file(
        "utils/is-string/is-string.js",
        "const isType = require('../is-type/is-type.js'); module.exports = function isString() { return isType() + ' and got is-string'; };",
    );
    helper.native("add utils/is-string -i utils/is-string");
    helper.native("link --rewire");
    helper.run("compile");
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("lane create lane-b");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    let before_switching_back = helper.clone_workspace();
    assert_eq!(len(&parse(&helper.native("lane show lane-a --json"))["components"]), 1);
    assert_eq!(len(&parse(&helper.native("lane show lane-b --json"))["components"]), 2);
    assert_eq!(len(&parse(&helper.native("list --local-scope --json"))), 3);
    let switch_out = strip_ansi(&helper.run("switch lane-a -x"));
    assert!(switch_out.contains(r#"successfully set "lane-a" as the active lane"#));
    assert_eq!(len(&parse(&helper.native("status --json"))["stagedComponents"]), 0);
    assert!(!helper.native("status").contains("bar/foo"));
    assert_eq!(len(&parse(&helper.native("list --json"))), 2);
    helper.get_cloned_workspace(&before_switching_back);
    helper.run("switch main -x");
    assert_eq!(len(&parse(&helper.native("list --json"))), 1);
    let status_main = helper.native("status");
    assert!(!status_main.contains("bar/foo") && !status_main.contains("utils/is-string"));
    helper.get_cloned_workspace(&before_switching_back);
    helper.run("switch lane-a -x");
    helper.native("switch main -x");
    assert_eq!(len(&parse(&helper.native("list --json"))), 1);
}

/// bit lane command › creating a lane from main after merging another lane into main locally
/// bit lane command › snapping on lane-b when the components are checked out to lane-a snaps
#[test]
fn create_lane_from_main_after_local_merge_and_block_snap_on_foreign_lane_deps() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    helper.native("export");

    helper.native("lane create lane-a");
    helper.populate_components(2, true, "-v2");
    helper.native("snap -m s1");
    helper.native("export");
    let comp1_lane_a = helper.head_of_lane("lane-a", "comp1");
    let comp2_lane_a = helper.head_of_lane("lane-a", "comp2");

    helper.native("switch main -x");
    let main_before_merge = helper.clone_workspace();
    helper.native("lane merge lane-a -x");
    helper.run("lane create lane-b");
    assert_eq!(helper.head_of_lane("lane-b", "comp1"), comp1_lane_a);
    assert_eq!(helper.head_of_lane("lane-b", "comp2"), comp2_lane_a);
    assert_eq!(parse(&helper.cat_object(&comp1_lane_a, true))["origin"]["lane"]["name"], "lane-a");
    helper.native("switch main -x");
    assert_eq!(len(&parse(&helper.native("status --json"))["stagedComponents"]), 0);

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
    helper.native("snap -m s1");
    let first_snap = helper.head_of_lane("lane-a", "comp1");
    helper.native("export");
    let out_of_date_state = helper.clone_workspace();
    helper.populate_components(1, false, "v2");
    helper.native("snap -m s2");
    let second_snap = helper.head_of_lane("lane-a", "comp1");
    helper.native("lane create lane-staged");
    assert_eq!(helper.head_of_lane("lane-staged", "comp1"), second_snap);
    helper.native("switch lane-a -x");
    helper.native("export");
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
    assert_eq!(len(&parse(&helper.run("status --json"))["outdatedComponents"]), 1);
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
    helper.native("snap -m s1");
    helper.native("export");
    let ws1_state = helper.clone_workspace();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("switch {}/dev -x", helper.scopes.remote));
    helper.populate_components(1, false, "v2-from-ws2");
    helper.native("snap -m s2-ws2");
    helper.native("export");
    helper.get_cloned_workspace(&ws1_state);
    helper.populate_components(1, false, "v2-from-ws1");
    helper.native("snap -m s2-ws1");
    let local_snap = helper.head_of_lane("dev", "comp1");
    helper.native("lane create dev-v2");
    assert_eq!(helper.head_of_lane("dev-v2", "comp1"), local_snap);
    helper.run("switch dev -x");
    assert_eq!(helper.head_of_lane("dev", "comp1"), local_snap);
    assert_eq!(len(&parse(&helper.run("status --json"))["stagedComponents"]), 1);
    helper.run("import -x");
    assert_eq!(len(&parse(&helper.run("status --json"))["stagedComponents"]), 1);
}

#[test]
fn creating_a_lane_rejects_local_tags_outdated_snaps_and_detached_heads() {
    use crate::commands::move_paths::support;
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    for name in ["comp1", "bar/foo", "utils/is-type"] {
        helper.output_file(&format!("{name}/index.js"), "module.exports = 1;\n");
        support::setup(&helper, &format!("add {name} -i {name}"));
    }
    support::setup(&helper, "tag --message initial");
    support::setup(&helper, "tag utils/is-type --unmodified --message second");
    crate::helper::remote::publish(&helper);
    support::setup(&helper, "tag comp1 --unmodified --message local");
    support::setup(&helper, "snap bar/foo --unmodified --message local");
    support::setup(&helper, "checkout 0.0.1 bar/foo -x");
    support::setup(&helper, "checkout 0.0.1 utils/is-type -x");
    support::setup(&helper, "snap utils/is-type --unmodified --detach-head --message detached");
    let result = support::compare_declined(&helper, "lane create dev", str::to_owned);
    assert!(!result.status.success());
    let error = format!("{}{}", result.stdout, result.stderr);
    assert!(error.contains("comp1 - has tags that were not exported (0.0.2)"), "{error}");
    assert!(error.contains("bar/foo - the workspace is on 0.0.1, not on the main head"), "{error}");
    assert!(error.contains("utils/is-type - the workspace is on"), "{error}");
    assert!(error.contains("a detached head that was not exported"), "{error}");
    assert!(!helper.native("lane list").contains("dev"));
}

//! `e2e/harmony/lanes/lane-diff.e2e.ts`.

use crate::helper::{Helper, strip_ansi};

const FOO_V2: &str = "module.exports = function foo() { return 'got foo v2'; }";
const FOO_V3: &str = "module.exports = function foo() { return 'got foo v3'; }";

fn expect_main_to_dev_diff(diff: &str) {
    let diff = strip_ansi(diff);
    assert!(diff.contains("--- foo.js (main)"), "{diff}");
    assert!(diff.contains("+++ foo.js (dev)"), "{diff}");
    assert!(diff.contains("-module.exports = function foo() { return 'got foo'; }"), "{diff}");
    assert!(diff.contains("+module.exports = function foo() { return 'got foo v2'; }"), "{diff}");
}

#[test]
fn diffing_the_current_lane_against_main() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("snap --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.create_component_bar_foo(FOO_V2);
    helper.native("snap --skip-tests");

    // with no args
    let diff = helper.run_cmd("lane diff");
    expect_main_to_dev_diff(&diff);
    assert!(!diff.contains("--- Id"));
    assert!(!diff.contains("+++ Id"));

    // with {toLane} being the default lane
    let diff = helper.run_cmd("lane diff main");
    expect_main_to_dev_diff(&diff);

    // with {fromLane} {toLane}
    let diff = helper.run_cmd("lane diff main dev");
    expect_main_to_dev_diff(&diff);

    // on the scope, after exporting the lane
    helper.native("export");
    let diff = Helper::cmd_in(&helper.scopes.remote_path, "lane diff dev");
    assert!(diff.status.success(), "{diff:?}");
    expect_main_to_dev_diff(&diff.stdout);
}

#[test]
fn bit_lane_diff_to_lane_non_default_on_the_workspace() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("");
    helper.add_component_bar_foo();
    helper.native("snap --skip-tests");
    helper.native("export");
    helper.native("lane create dev");
    helper.create_component_bar_foo(FOO_V2);
    helper.native("snap --skip-tests");
    helper.native("switch main");
    helper.native("lane create stage");
    helper.create_component_bar_foo(FOO_V3);
    helper.native("snap --skip-tests");

    let diff = strip_ansi(&helper.run_cmd("lane diff dev"));
    assert!(diff.contains("--- foo.js (dev)"), "{diff}");
    assert!(diff.contains("+++ foo.js (stage)"), "{diff}");
    assert!(diff.contains("-module.exports = function foo() { return 'got foo v2'; }"), "{diff}");
    assert!(diff.contains("+module.exports = function foo() { return 'got foo v3'; }"), "{diff}");
    assert!(!diff.contains("--- Id"));
    assert!(!diff.contains("+++ Id"));
}

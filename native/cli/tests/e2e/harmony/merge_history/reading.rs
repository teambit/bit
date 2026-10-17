//! History views keep published BFS lane marking, range overlays and formatting.
use super::node;
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs};

pub(super) fn compare_log(helper: &Helper) {
    let baseline = helper.clone_workspace();
    for color in ["0", "1"] {
        for view in ["--json", "", "--parents", "--one-line"] {
            let command = format!("log bar/foo {view}");
            let expected = Helper::cmd_in_with(
                &baseline,
                &command,
                &[
                    ("BIT_NATIVE", OsStr::new("off")),
                    ("FORCE_COLOR", OsStr::new(color)),
                    ("NODE_NO_WARNINGS", OsStr::new("1")),
                ],
            );
            let actual = Helper::cmd_in_with(
                &helper.scopes.local_path,
                &command,
                &[("FORCE_COLOR", OsStr::new(color)), ("NODE_NO_WARNINGS", OsStr::new("1"))],
            );
            assert!(actual.native, "{command}: {}", actual.trace);
            assert_eq!(actual.status.code(), expected.status.code(), "{command}");
            assert_eq!(actual.stdout, expected.stdout, "{command} color {color}");
            assert_eq!(actual.stderr, expected.stderr, "{command}");
        }
    }
}

#[test]
fn divergent_lane_logs_match_all_published_views() {
    let helper = versions();
    node(&helper, "lane create dev");
    helper.output_file("bar/foo.js", "module.exports = 'lane';\n");
    node(&helper, "snap bar/foo -m lane");
    crate::helper::remote::publish(&helper);
    node(&helper, "switch main --force-theirs -x");
    helper.output_file("bar/foo.js", "module.exports = 'main';\n");
    node(&helper, "tag bar/foo -m main");
    crate::helper::remote::publish(&helper);
    node(&helper, "switch dev --force-theirs -x");
    compare_log(&helper);
}

fn versions() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'base';\n");
    helper.add_component_bar_foo();
    node(&helper, "tag bar/foo -m base");
    crate::helper::remote::publish(&helper);
    helper
}

#[test]
fn historical_deprecation_and_removal_overlays_match_log_views() {
    let helper = versions();
    helper.output_file("bar/foo.js", "module.exports = 'second';\n");
    node(&helper, "tag bar/foo -m second");
    node(&helper, "deprecate bar/foo --range 0.0.1");
    compare_log(&helper);
    node(&helper, "tag bar/foo --unmodified -m deprecated");
    compare_log(&helper);
    node(&helper, "delete bar/foo --range 0.0.2 --silent");
    node(&helper, "tag bar/foo --unmodified -m deleted");
    compare_log(&helper);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(bitmap["bar/foo"]["version"].is_string());
}

#[test]
fn historical_checkout_after_unrelated_merge_matches_node() {
    let (helper, _) = super::unrelated();
    checkout_unrelated(&helper);
}

#[test]
fn canonical_remote_seed_preserves_independent_lanes_and_native_historical_checkout() {
    let (helper, _) = super::unrelated_with(crate::helper::remote::seed_after_node_export);
    for lane in ["left", "right"] {
        let result = Helper::cmd_in_with(
            &helper.scopes.remote_path,
            &format!("cat-lane {lane}"),
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(result.status.success(), "{lane}: {} {}", result.stdout, result.stderr);
        assert_eq!(crate::helper::parse(&result.stdout)["name"], lane);
    }
    checkout_unrelated(&helper);
}

fn checkout_unrelated(helper: &Helper) {
    node(helper, &format!("lane merge {}/right --resolve-unrelated ours -x", helper.scopes.remote));
    let baseline = helper.clone_workspace();
    let command = "checkout head~1 bar/foo --force-theirs -x";
    let expected = Helper::cmd_in_with(&baseline, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, command, &[]);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(super::stable(&actual.stdout), super::stable(&expected.stdout));
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&baseline.join(".bitmap")),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(baseline.join("bar/foo.js")).unwrap(),
    );
}

#[test]
fn historical_checkout_after_squashed_merge_keeps_main_parent() {
    let helper = versions();
    node(&helper, "lane create dev");
    for text in ["first", "second"] {
        helper.output_file("bar/foo.js", &format!("module.exports = '{text}';\n"));
        node(&helper, "snap bar/foo -m lane");
    }
    crate::helper::remote::publish(&helper);
    node(&helper, "switch main --force-theirs -x");
    node(&helper, "lane merge dev -x");
    let baseline = helper.clone_workspace();
    let command = "checkout head~1 bar/foo --force-theirs -x";
    let expected = Helper::cmd_in_with(
        &baseline,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let actual =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(super::stable(&actual.stdout), super::stable(&expected.stdout));
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&baseline.join(".bitmap")),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(baseline.join("bar/foo.js")).unwrap(),
    );
}

#[test]
fn active_lane_checkout_imports_remote_and_bitmap_versions_with_main_only_components() {
    let helper = versions();
    helper.output_file("baz/index.js", "module.exports = 'main only';\n");
    node(&helper, "add baz -i baz/other");
    node(&helper, "tag baz/other -m other");
    crate::helper::remote::publish(&helper);
    node(&helper, "lane create dev");
    helper.output_file("bar/foo.js", "module.exports = 'lane';\n");
    node(&helper, "snap bar/foo -m lane");
    crate::helper::remote::publish(&helper);
    let baseline = helper.clone_workspace();
    let command = "checkout 0.0.1 bar/foo --force-theirs -x";
    let expected = Helper::cmd_in_with(&baseline, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = Helper::cmd_in_with(&helper.scopes.local_path, command, &[]);
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(super::stable(&actual.stdout), super::stable(&expected.stdout));
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&baseline.join(".bitmap")),
    );
    for file in ["bar/foo.js", "baz/index.js"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(file)).unwrap(),
            fs::read(baseline.join(file)).unwrap(),
        );
    }
}

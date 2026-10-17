//! Unrelated lane histories retain their published source and ancestry choices.
mod reading;
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs, path::PathBuf};

fn node(helper: &Helper, command: &str) {
    let result = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(result.status.success(), "{command}: {} {}", result.stdout, result.stderr);
}

pub(super) fn unrelated() -> (Helper, PathBuf) {
    unrelated_with(crate::helper::remote::publish)
}

pub(super) fn unrelated_with(publish: fn(&Helper)) -> (Helper, PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let empty = helper.clone_workspace();
    let mut left = PathBuf::new();
    for lane in ["left", "right"] {
        helper.get_cloned_workspace(&empty);
        node(&helper, &format!("lane create {lane}"));
        helper.create_component_bar_foo(&format!("module.exports = '{lane}';\n"));
        helper.add_component_bar_foo();
        node(&helper, &format!("snap --ignore-issues * --message {lane}"));
        publish(&helper);
        if lane == "left" {
            left = helper.clone_workspace();
        }
    }
    helper.get_cloned_workspace(&left);
    (helper, left)
}

fn stable(output: &str) -> String {
    output
        .lines()
        .map(|line| {
            line.split_once(" (completed in ")
                .map_or_else(|| line.to_owned(), |(prefix, _)| format!("{prefix} (completed)"))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn compare(helper: &Helper, command: &str) -> PathBuf {
    let baseline = helper.clone_workspace();
    let expected = Helper::cmd_in_with(
        &baseline,
        command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    let actual =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
    assert!(actual.native, "{command}: {}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code(), "{} {}", actual.stdout, actual.stderr);
    assert_eq!(stable(&actual.stdout), stable(&expected.stdout));
    assert_eq!(actual.stderr, expected.stderr);
    for file in ["bar/foo.js", ".bitmap"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(file)).unwrap(),
            fs::read(baseline.join(file)).unwrap(),
            "{file}",
        );
    }
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let expected_scope = bit_object_import::scope_path(&baseline);
    assert_eq!(
        config::read_jsonc(&scope.join("unmerged.json")),
        config::read_jsonc(&expected_scope.join("unmerged.json")),
    );
    baseline
}

#[test]
fn unrelated_lane_source_choices_retain_exact_pending_ancestry() {
    let (helper, left) = unrelated();
    for strategy in ["ours", "theirs"] {
        helper.get_cloned_workspace(&left);
        compare(
            &helper,
            &format!(
                "lane merge {}/right --resolve-unrelated {strategy} --no-auto-snap -x",
                helper.scopes.remote,
            ),
        );
        let expected = if strategy == "ours" { "left" } else { "right" };
        assert_eq!(
            fs::read_to_string(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
            format!(
                "module.exports = '{expected}';{}",
                if cfg!(windows) && strategy == "theirs" { "\r\n" } else { "\n" }
            ),
        );
    }
}

#[test]
fn unrelated_main_relation_is_reused_independently_of_source_strategy() {
    let (helper, left) = unrelated();
    node(&helper, "lane switch main -x");
    node(&helper, &format!("lane merge {}/left -x", helper.scopes.remote));
    crate::helper::remote::publish(&helper);
    for strategy in ["ours", "theirs"] {
        helper.get_cloned_workspace(&left);
        compare(
            &helper,
            &format!(
                "lane merge {}/right --resolve-unrelated {strategy} --no-auto-snap -x",
                helper.scopes.remote,
            ),
        );
    }
}

#[test]
fn embedded_git_scope_lane_history_matches_node() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    node(&helper, "lane create history");
    helper.create_component_bar_foo("module.exports = 'history';\n");
    helper.add_component_bar_foo();
    node(&helper, "snap --ignore-issues * --message history");
    fs::create_dir(helper.scopes.local_path.join(".git")).unwrap();
    fs::rename(helper.scopes.local_path.join(".bit"), helper.scopes.local_path.join(".git/bit"))
        .unwrap();
    let baseline = helper.clone_workspace();
    let expected =
        Helper::cmd_in_with(&baseline, "lane history --json", &[("BIT_NATIVE", OsStr::new("off"))]);
    let actual = helper.native_run("lane history --json");
    assert!(actual.native, "{}", actual.trace);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    reading::compare_log(&helper);
    assert!(!helper.scopes.local_path.join(".bit").exists());
}

#[test]
fn unrelated_pending_snap_publishes_exact_parent_and_unrelated_provenance() {
    let (helper, left) = unrelated();
    for strategy in ["ours", "theirs"] {
        helper.get_cloned_workspace(&left);
        let baseline = compare(
            &helper,
            &format!(
                "lane merge {}/right --resolve-unrelated {strategy} --no-auto-snap -x",
                helper.scopes.remote,
            ),
        );
        snap_pending(&helper, &baseline);
    }
}

fn snap_pending(helper: &Helper, baseline: &std::path::Path) {
    let scope = bit_object_import::scope_path(&helper.scopes.local_path);
    let pending = config::read_jsonc(&scope.join("unmerged.json"));
    let command = "snap --unmerged --ignore-issues * --message related";
    let actual = helper.native_run(command);
    let expected = Helper::cmd_in_with(baseline, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "{} {}",
        actual.stderr,
        expected.stderr,
    );
    assert_eq!(actual.stderr, expected.stderr);
    let actual_bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected_bitmap = config::read_jsonc(&baseline.join(".bitmap"));
    let actual_ref = actual_bitmap["bar/foo"]["version"].as_str().unwrap();
    let expected_ref = expected_bitmap["bar/foo"]["version"].as_str().unwrap();
    // Allocation IDs, batch IDs and clock values are independently generated;
    // the existing snapshot oracle removes only those and resolves graph refs.
    assert_eq!(
        actual.stdout.replace(actual_ref, "SNAP"),
        expected.stdout.replace(expected_ref, "SNAP"),
    );
    assert_eq!(
        actual_bitmap.to_string().replace(actual_ref, "SNAP"),
        expected_bitmap.to_string().replace(expected_ref, "SNAP"),
    );
    let version = super::snapshot_environments::version(&helper.scopes.local_path);
    assert_eq!(version, super::snapshot_environments::version(baseline));
    assert_eq!(
        version["parents"],
        serde_json::json!([pending[0]["unrelated"]["headOnCurrentLane"]]),
    );
    assert_eq!(version["unrelated"]["head"], pending[0]["unrelated"]["unrelatedHead"]);
    assert_eq!(version["unrelated"]["laneId"], pending[0]["unrelated"]["unrelatedLaneId"]);
}

#[test]
fn unrelated_merge_automatically_snaps_canonical_ancestry() {
    let (helper, left) = unrelated();
    for strategy in ["ours", "theirs"] {
        helper.get_cloned_workspace(&left);
        let baseline = helper.clone_workspace();
        let flag =
            if strategy == "ours" { "--resolve-unrelated" } else { "--resolve-unrelated=theirs" };
        let command = format!("lane merge {}/right {flag} -x", helper.scopes.remote);
        let expected = Helper::cmd_in_with(
            &baseline,
            &command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
        );
        let actual =
            Helper::cmd_in_with(&helper.scopes.local_path, &command, &[("CI", OsStr::new("1"))]);
        assert!(actual.native, "{command}: {}", actual.trace);
        assert_eq!(
            actual.status.code(),
            expected.status.code(),
            "{} {}",
            actual.stdout,
            actual.stderr,
        );
        assert_eq!(actual.stderr, expected.stderr);
        compare_snapped(&helper, &baseline, &actual, &expected);
    }
}

fn compare_snapped(
    helper: &Helper,
    baseline: &std::path::Path,
    actual: &crate::helper::Run,
    expected: &crate::helper::Run,
) {
    let actual_bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected_bitmap = config::read_jsonc(&baseline.join(".bitmap"));
    let actual_ref = actual_bitmap["bar/foo"]["version"].as_str().unwrap();
    let expected_ref = expected_bitmap["bar/foo"]["version"].as_str().unwrap();
    assert_eq!(
        stable(&actual.stdout).replace(actual_ref, "SNAP"),
        stable(&expected.stdout).replace(expected_ref, "SNAP"),
    );
    assert_eq!(
        actual_bitmap.to_string().replace(actual_ref, "SNAP"),
        expected_bitmap.to_string().replace(expected_ref, "SNAP"),
    );
    assert_eq!(
        super::snapshot_environments::version(&helper.scopes.local_path),
        super::snapshot_environments::version(baseline),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(baseline.join("bar/foo.js")).unwrap(),
    );
}

#[test]
fn unrelated_history_without_resolution_preserves_canonical_failure_and_workspace() {
    for ci in ["", "1"] {
        let (helper, _) = unrelated();
        let baseline = helper.clone_workspace();
        let command = format!("lane merge {}/right -x", helper.scopes.remote);
        let expected = Helper::cmd_in_with(
            &baseline,
            &command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new(ci))],
        );
        let actual =
            Helper::cmd_in_with(&helper.scopes.local_path, &command, &[("CI", OsStr::new(ci))]);
        assert_eq!(actual.native, ci.is_empty(), "{}", actual.trace);
        assert_eq!(actual.status.code(), expected.status.code());
        assert_eq!(stable(&actual.stdout), stable(&expected.stdout));
        assert_eq!(actual.stderr, expected.stderr);
        assert_eq!(
            fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
            fs::read(baseline.join("bar/foo.js")).unwrap(),
        );
        assert_eq!(
            config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
            config::read_jsonc(&baseline.join(".bitmap")),
        );
    }
}

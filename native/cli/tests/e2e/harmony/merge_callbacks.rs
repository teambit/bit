//! One retained published provider session spans native merge, pre-snap and builder phases.
mod artifacts;
mod fixture;
mod original;
mod package;
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs};

#[test]
fn component_merge_retains_one_provider_through_native_continuation() {
    let helper = fixture::component();
    compare(&helper, "merge bar/foo --auto-merge-resolve theirs -m merged -x", true, false);
}

#[test]
fn lane_merge_retains_one_compiled_provider_through_snapshot() {
    qualify("lane merge dev --auto-merge-resolve theirs -m merged -x", false, false);
}
#[test]
fn lane_merge_build_uses_the_published_pipeline_once() {
    qualify("lane merge dev --auto-merge-resolve theirs --build -m merged -x", false, true);
}
#[test]
fn force_local_build_is_honored_for_configured_lane_merge() {
    let helper = fixture::lane();
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.harmony/config-store",
        serde_json::json!({"force_local_build":true}),
    );
    compare(&helper, "lane merge dev --auto-merge-resolve theirs -m merged -x", true, true);
}
#[test]
fn failing_lane_merge_builder_retains_materialization_and_staged_snap_prefix() {
    qualify("lane merge dev --auto-merge-resolve theirs --build -m rejected -x", true, true);
}
fn qualify(command: &str, fail: bool, build: bool) {
    let helper = fixture::lane();
    if fail {
        helper.output_file("merge-build-fails", "reject");
    }
    compare(&helper, command, !fail, build);
}
fn compare(helper: &Helper, command: &str, success: bool, build: bool) {
    let oracle = helper.clone_workspace();
    let actual = helper.native_run(command);
    let expected = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    compare_results(helper, &oracle, &actual, &expected, success, build);
}
fn compare_results(
    helper: &Helper,
    oracle: &std::path::Path,
    actual: &crate::helper::Run,
    expected: &crate::helper::Run,
    success: bool,
    build: bool,
) {
    assert!(actual.status.success(), "{} {}", actual.stdout, actual.stderr);
    assert_eq!(
        actual.status.code(),
        expected.status.code(),
        "native {} {}\nNode {} {}",
        actual.stdout,
        actual.stderr,
        expected.stdout,
        expected.stderr,
    );
    assert_eq!(
        fixture::output(&actual.stdout, &helper.scopes.local_path),
        fixture::output(&expected.stdout, oracle),
    );
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(actual.stdout.matches("merge provider startup").count(), 1);
    for file in ["bar/foo.js", "merge-presnap-events"] {
        assert_eq!(
            fs::read(helper.scopes.local_path.join(file)).unwrap(),
            fs::read(oracle.join(file)).unwrap(),
            "{file}",
        );
    }
    assert_eq!(fs::read(helper.scopes.local_path.join("merge-presnap-events")).unwrap(), b"x");
    if build {
        assert_eq!(fs::read(helper.scopes.local_path.join("merge-build-events")).unwrap(), b"x");
    }
    fixture::publication(helper, oracle, success);
}

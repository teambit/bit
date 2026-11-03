//! Unit tests for `build` command [`parse_options`] and capsule [`flag_error`] validation.
//!
//! Verifies [`Options`] pipeline flags and [`is_empty_build_workspace`] workspace detection.

use super::{Options, flag_error, is_empty_build_workspace, parse_options};
use std::fs;

/// Verifies [`parse_options`] for `bit build` [`Options`] pipeline flags and [`flag_error`] capsule flag validation.
#[test]
fn parses_build_options_and_validates_capsule_flags() {
    let opts = parse_options(&[
        "ui/*",
        "-u",
        "--dev",
        "--tasks",
        "compile",
        "--skip-tasks=test",
        "--fail-fast",
        "--loose",
        "--reset",
    ])
    .unwrap();
    assert_eq!(opts.pattern.as_deref(), Some("ui/*"));
    assert!(opts.unmodified);
    assert!(opts.dev);
    assert_eq!(opts.pipeline.tasks.as_deref(), Some("compile"));
    assert_eq!(opts.pipeline.skip_tasks.as_deref(), Some("test"));
    assert!(opts.pipeline.fail_fast);
    assert!(opts.pipeline.loose);
    assert!(opts.pipeline.reset);
    assert_eq!(flag_error(&opts.capsules), None);

    let list_bare = parse_options(&["--list-tasks"]).unwrap();
    assert_eq!(list_bare.list_tasks.as_deref(), Some(""));

    let list_comp = parse_options(&["--list-tasks", "comp1"]).unwrap();
    assert_eq!(list_comp.list_tasks.as_deref(), Some("comp1"));

    let bad_rewrite = parse_options(&["--rewrite"]).unwrap();
    assert_eq!(
        flag_error(&bad_rewrite.capsules),
        Some("cannot use --rewrite without --reuse-capsules"),
    );

    let bad_reinstall = parse_options(&["--reinstall"]).unwrap();
    assert_eq!(
        flag_error(&bad_reinstall.capsules),
        Some("cannot use --reinstall without --reuse-capsules"),
    );
}

/// Verifies [`is_empty_build_workspace`] on an empty `.bitmap` with and without `--list-tasks`.
/// Confirms `--list-tasks` bypasses the empty-workspace short-circuit.
#[test]
fn detects_empty_build_workspace() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(
        temp.path().join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(temp.path().join(".bitmap"), "{}").unwrap();

    assert!(is_empty_build_workspace(temp.path(), &Options::default()).unwrap());
    let list_opts = Options { list_tasks: Some("comp1".into()), ..Options::default() };
    assert!(!is_empty_build_workspace(temp.path(), &list_opts).unwrap());
}

/// Verifies that `--reuse-capsules` permits both `--rewrite` and `--reinstall` in [`flag_error`].
/// Confirms `flag_error` returns `None` when all three capsule flags are combined.
#[test]
fn reuse_capsules_allows_rewrite_and_reinstall_flags() {
    let opts = parse_options(&["--reuse-capsules", "--rewrite", "--reinstall"]).unwrap();
    assert_eq!(flag_error(&opts.capsules), None);
}

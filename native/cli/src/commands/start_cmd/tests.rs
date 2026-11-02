//! Unit tests for `bit start` CLI option parsing ([`parse_options`]) and missing workspace/scope detection ([`is_outside_workspace_and_scope`]).
//!
//! Verifies `--dev`, `--port`, `--rebuild`, `--skip-ui-build`, and `--skip-compilation` flags.

use super::{is_outside_workspace_and_scope, parse_options};

/// Verifies `bit start` option parsing via [`parse_options`] and host checks via [`is_outside_workspace_and_scope`].
#[test]
fn parses_start_options_and_detects_missing_workspace_or_scope() {
    let opts = parse_options(&[
        "ui/*",
        "-d",
        "-p",
        "3000",
        "--rebuild",
        "--skip-ui-build",
        "-n",
        "--skip-compilation",
    ])
    .unwrap();
    assert_eq!(opts.pattern.as_deref(), Some("ui/*"));
    assert!(opts.dev);
    assert_eq!(opts.port.as_deref(), Some("3000"));
    assert!(opts.rebuild);
    assert!(opts.skip_ui_build);
    assert!(opts.no_browser);
    assert!(opts.skip_compilation);

    let combined = parse_options(&["-drsnv"]).unwrap();
    assert!(combined.dev && combined.rebuild && combined.skip_ui_build && combined.no_browser);

    let temp = tempfile::tempdir().unwrap();
    assert!(is_outside_workspace_and_scope(temp.path()));
}

/// Verifies that [`parse_options`] parses an empty argument slice with `pattern: None` and default flags.
///
/// Ensures `bit start` without arguments defaults `dev` and `rebuild` to `false`.
#[test]
fn empty_start_args_parse_with_no_pattern() {
    let opts = parse_options(&[]).unwrap();
    assert!(opts.pattern.is_none());
    assert!(!opts.dev && !opts.rebuild);
}

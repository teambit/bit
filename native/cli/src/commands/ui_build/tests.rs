//! Unit tests for `bit ui-build` [`Options`] CLI parsing ([`parse_options`]) and missing workspace/scope detection ([`is_outside_workspace_and_scope`]).
//!
//! Verifies optional UI root name parsing and rejection of extra positional or flag arguments.

use super::{Options, is_outside_workspace_and_scope, parse_options};

/// Verifies `bit ui-build` [`Options`] parsing via [`parse_options`] and host checks via [`is_outside_workspace_and_scope`].
#[test]
fn parses_ui_build_options_and_detects_missing_host() {
    assert_eq!(parse_options(&[]), Some(Options { ui_root_name: None }));
    assert_eq!(
        parse_options(&["teambit.workspace/workspace"]),
        Some(Options { ui_root_name: Some("teambit.workspace/workspace".into()) }),
    );
    let temp = tempfile::tempdir().unwrap();
    assert!(is_outside_workspace_and_scope(temp.path()));
}

/// Verifies that [`parse_options`] rejects multiple positional arguments or unknown flags.
#[test]
fn declines_extra_positional_and_unknown_flags() {
    assert_eq!(parse_options(&["root-a", "root-b"]), None);
    assert_eq!(parse_options(&["--unknown"]), None);
}

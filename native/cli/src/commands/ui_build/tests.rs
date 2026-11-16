//! Unit tests for `bit ui-build` [`Options`] CLI parsing ([`parse_options`]) and missing workspace/scope detection ([`is_outside_workspace_and_scope`]).
//!
//! Verifies optional UI root name parsing into [`Options`] and rejection of extra positional or flag arguments across [`parse_options`].

use super::{Options, is_outside_workspace_and_scope, parse_options};

/// Verifies `bit ui-build` [`Options`] CLI parsing via [`parse_options`] and host checks via [`is_outside_workspace_and_scope`].
///
/// Checks both empty arguments (`ui_root_name: None`) and explicit UI root aspect IDs.
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

/// Verifies that [`parse_options`] returns `None` for multiple positional arguments or unknown flags.
///
/// Ensures `bit ui-build` accepts at most one UI root positional argument.
#[test]
fn declines_extra_positional_and_unknown_flags() {
    assert_eq!(parse_options(&["root-a", "root-b"]), None);
    assert_eq!(parse_options(&["--unknown"]), None);
}

//! Unit tests for `bit resume-export` [`Options`] CLI parsing ([`parse_options`]).
//!
//! Verifies export ID, remote scope lists, and `--delete` / `--force` flag combinations across [`Options`] and [`parse_options`].

use super::{Options, parse_options};

/// Verifies `bit resume-export` [`Options`] CLI flag parsing via [`parse_options`].
///
/// Checks required remote scope arguments alongside `--delete` and `--force` boolean flags.
#[test]
fn parses_resume_export_options() {
    assert_eq!(parse_options(&["id-1"]), None);
    assert_eq!(parse_options(&["id-1", "fixture.scope", "-d"]), None);
    assert_eq!(parse_options(&["id-1", "fixture.scope", "-f"]), None);
    assert_eq!(
        parse_options(&["id-1", "scope-a", "scope-b", "--delete", "--force"]),
        Some(Options {
            export_id: "id-1".into(),
            remotes: vec!["scope-a".into(), "scope-b".into()],
            delete: true,
            force: true,
        }),
    );
    assert_eq!(
        parse_options(&["id-1", "scope-a", "--delete=true", "--force=false"]),
        Some(Options {
            export_id: "id-1".into(),
            remotes: vec!["scope-a".into()],
            delete: true,
            force: false,
        }),
    );
}

/// Verifies that [`parse_options`] returns `None` when given an empty argument slice (`&[]`).
///
/// Ensures `bit resume-export` without an export ID and remote scope declines native execution.
#[test]
fn empty_resume_export_args_return_none() {
    assert_eq!(parse_options(&[]), None);
}

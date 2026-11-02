//! Unit tests for `bit merge --resolve` CLI option parsing ([`parse`]) and resolved-component report formatting ([`format`]).
//!
//! Verifies `--resolve` option constraints and unversioned component ID formatting via [`Chalk`].

use super::{format, parse};
use crate::commands::color::Chalk;
use serde_json::json;

/// Verifies `bit merge --resolve` option parsing and rejection of incompatible flags.
#[test]
fn resolve_options() {
    let options = parse(&["--resolve", "-x", "remote/one", "-m", "done"]).unwrap();
    assert_eq!(
        (options.pattern.as_deref(), options.message.as_deref()),
        (Some("remote/one"), Some("done")),
    );
    assert!(parse(&["-x"]).is_none(), "a merge without --resolve");
    assert!(parse(&["--resolve", "--abort"]).is_none());
    assert!(parse(&["--resolve", "a", "b"]).is_none());
}

/// Verifies that [`format`] strips version suffixes from resolved component IDs.
///
/// Also confirms that unexpected top-level JSON fields cause [`format`] to return an error.
#[test]
fn resolved_components_are_listed_without_versions() {
    let result = json!({ "resolvedComponents": [{ "id": "s/a@0123456789abcdef0123456789abcdef01234567" }, { "id": "s/b@1.0.0" }] });
    let report = format(&result, Chalk::new(false)).unwrap();
    assert_eq!(report.data, "resolved components (2)\n   › s/a\n   › s/b");
    assert!(format(&json!({ "resolvedComponents": [], "other": 1 }), Chalk::new(false)).is_err());
}

/// Verifies that [`format`] declines when `resolvedComponents` contains duplicate unversioned identities.
///
/// Ensures multiple entries for the same component ID fall back to the non-fast-path renderer.
#[test]
fn duplicate_resolved_component_identities_decline_formatting() {
    let duplicate = json!({ "resolvedComponents": [{ "id": "s/a@1.0.0" }, { "id": "s/a@2.0.0" }] });
    assert!(format(&duplicate, Chalk::new(false)).is_err());
}

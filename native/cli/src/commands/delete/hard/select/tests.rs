//! Unit tests for hard-delete [`wildcard`] selector matching across nested namespaces.
//!
//! Verifies single-segment `*`, recursive `**`, and exact component ID matching.

use super::wildcard;

/// Verifies that [`wildcard`] matches nested namespaces while rejecting unrelated prefixes.
#[test]
fn wildcard_matches_nested_namespaces_without_matching_other_prefixes() {
    assert!(wildcard("ui/*", "ui/button"));
    assert!(wildcard("ui/**", "ui/form/button"));
    assert!(!wildcard("ui/*", "other/button"));
    assert!(!wildcard("ui/button", "ui/buttons"));
}

/// Verifies that an exact component ID and `**` match in [`wildcard`].
///
/// Ensures both literal scoped IDs and recursive globs evaluate to `true`.
#[test]
fn exact_component_id_matches_itself_in_wildcard_helper() {
    assert!(wildcard("ui/button", "ui/button"));
    assert!(wildcard("**", "any/nested/component"));
}

//! Unit tests for npm package name and version specifier splitting ([`parse_package_name`], [`parsed`]) in
//! `bit-install` package resolution.

use super::parse_package_name;
use pretty_assertions::assert_eq;

/// Wraps `(name, version)` into an owned `Some((String, String))` tuple for [`parse_package_name`] assertions.
fn parsed(name: &str, version: &str) -> Option<(String, String)> {
    Some((name.to_string(), version.to_string()))
}

/// Verifies that [`parse_package_name`] splits scoped, unscoped, and subpath package specifiers like `parse-package-name` ([`parsed`]).
#[test]
fn parses_package_names_like_parse_package_name() {
    assert_eq!(parse_package_name("lodash"), parsed("lodash", ""));
    assert_eq!(parse_package_name("lodash@^4.0.0"), parsed("lodash", "^4.0.0"));
    assert_eq!(parse_package_name("@scope/pkg@1.0.0"), parsed("@scope/pkg", "1.0.0"));
    assert_eq!(parse_package_name("@scope/pkg/sub/path@latest"), parsed("@scope/pkg", "latest"));
    assert_eq!(parse_package_name("pkg/sub@2"), parsed("pkg", "2"));
}

/// Verifies that [`parse_package_name`] returns `None` for filesystem paths, bare scopes, and empty strings.
#[test]
fn rejects_what_is_not_a_package_name() {
    assert_eq!(parse_package_name("/abs/path"), None);
    assert_eq!(parse_package_name("@scope"), None);
    assert_eq!(parse_package_name(""), None);
}

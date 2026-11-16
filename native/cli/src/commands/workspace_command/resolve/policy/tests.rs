//! Unit tests for `--ignore-issues`, `--ignore-newest-version`, and `--no-lock-deps` policy CLI flag parsing ([`parse`]).
//!
//! Verifies policy option extraction alongside remaining positional component patterns across [`parse`].

use super::parse;
use serde_json::json;

/// Verifies [`parse`] separates [`json`] policy flag values from positional component patterns.
///
/// Checks `-i` (`ignoreIssues`), `-I` (`ignoreNewestVersion`), and `--no-lock-deps` extraction.
#[test]
fn policy_values_are_not_component_patterns() {
    let (policy, remaining) =
        parse(&["comp/*", "-i", "MissingDists, ParseErrors", "-I", "--no-lock-deps"], true)
            .unwrap();
    assert_eq!(remaining, ["comp/*"]);
    let mut options = json!({});
    policy.apply(&mut options);
    assert_eq!(options["policy"]["ignoreIssues"], "MissingDists, ParseErrors");
    assert_eq!(options["policy"]["ignoreNewestVersion"], true);
    assert_eq!(options["policy"]["noLockDeps"], true);
    assert!(parse(&["-i", "*", "--ignore-issues", "ParseErrors"], true).is_none());
    assert!(parse(&["-i", "--no-lock-deps"], true).is_none());
    assert!(parse(&["--ignore-newest-version"], false).is_some());
}

/// Verifies that [`parse`] returns `None` when `--no-lock-deps` is passed more than once.
///
/// Ensures duplicate boolean policy flags decline native parsing.
#[test]
fn duplicate_no_lock_deps_is_rejected() {
    assert!(parse(&["--no-lock-deps", "--no-lock-deps"], false).is_none());
}

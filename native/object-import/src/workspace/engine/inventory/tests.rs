//! Unit tests for workspace inventory directory prefix depth and count budgets via [`validate_prefixes`].
//!
//! Confirms that excessive path nesting or directory prefix counts decline before policy evaluation while root-level files pass.

use super::validate_prefixes;
/// Verifies that [`validate_prefixes`] enforces maximum directory depth and prefix count limits before policy evaluation.
#[test]
fn parent_budget_declines_before_recursive_policy_evaluation() {
    assert!(validate_prefixes(&[format!("{}file", "a/".repeat(129))]).is_err());
    assert!(validate_prefixes(&vec![format!("{}file", "a/".repeat(128)); 4096]).is_err());
    assert!(validate_prefixes(&["a/b/file".to_owned()]).is_ok());
}

/// Verifies that [`validate_prefixes`] accepts empty and root-level relative file path slices.
#[test]
fn empty_and_root_level_file_lists_pass_prefix_validation() {
    assert!(validate_prefixes(&[]).is_ok());
    assert!(validate_prefixes(&["index.ts".to_owned(), "README.md".to_owned()]).is_ok());
}

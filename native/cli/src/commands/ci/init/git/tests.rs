//! Released branch validation uses `ECMAScript` whitespace rather than Rust's Unicode set.
//!
//! Verifies empty-string trimming and Unicode whitespace distinctions in branch names for `valid_branch` and `trim`.
/// Verifies that branch validation and trimming preserve the released `ECMAScript` Unicode whitespace distinction.
/// Specifically contrasts BOM (`\u{feff}`, treated as whitespace) with NEL (`\u{0085}`, retained).
#[test]
fn branch_validation_and_trimming_preserve_the_released_unicode_distinction() {
    assert!(!super::valid_branch("release\u{feff}next"));
    assert!(super::valid_branch("release\u{0085}next"));
    assert_eq!(super::super::trim("\u{feff}main\u{feff}"), "main");
    assert_eq!(super::super::trim("\u{0085}main\u{0085}"), "\u{0085}main\u{0085}");
}

/// Verifies that empty and whitespace-only branch names are rejected while valid branch names pass.
///
/// Covers `""`, ASCII spaces, and a slash-qualified branch name.
#[test]
fn empty_and_whitespace_only_branch_names_are_rejected() {
    assert!(!super::valid_branch(""));
    assert!(!super::valid_branch("   "));
    assert!(super::valid_branch("feature/clean-branch"));
}

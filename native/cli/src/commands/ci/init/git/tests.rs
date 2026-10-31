//! Released branch validation uses ECMAScript whitespace rather than Rust's Unicode set.
#[test]
fn branch_validation_and_trimming_preserve_the_released_unicode_distinction() {
    assert!(!super::valid_branch("release\u{feff}next"));
    assert!(super::valid_branch("release\u{0085}next"));
    assert_eq!(super::super::trim("\u{feff}main\u{feff}"), "main");
    assert_eq!(super::super::trim("\u{0085}main\u{0085}"), "\u{0085}main\u{0085}");
}

//! Unit tests for platform-specific component move path prefix matching ([`super::matches_from`]) in
//! `bit-object-import` path projections.

#[test]
fn native_join_and_linux_from_keep_the_published_windows_mismatch() {
    assert!(super::matches_from("comp1/nested/main.js", "comp1/nested", false));
    assert!(!super::matches_from("comp1/nested/main.js", "comp1/nested", true));
}

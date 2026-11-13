//! Unit tests for platform-specific component move path prefix matching ([`super::matches_from`]) in
//! `bit-object-import` path projections ([`native_join_and_linux_from_keep_the_published_windows_mismatch`]) across Unix and Windows separator rules.

/// Verifies that [`super::matches_from`] matches forward-slash paths on Unix (`windows = false`) while preserving Bit's Windows path separator mismatch (`windows = true`) during `bit move` (`comp1/nested/main.js`, `comp1/nested`).
#[test]
fn native_join_and_linux_from_keep_the_published_windows_mismatch() {
    assert!(super::matches_from("comp1/nested/main.js", "comp1/nested", false));
    assert!(!super::matches_from("comp1/nested/main.js", "comp1/nested", true));
}

//! Unit tests for POSIX path joining ([`join_linux`]) and ignore-pattern rebasing ([`pattern`]) in inventory scans.
//!
//! Verifies `pathJoinLinux` and `rebaseIgnorePattern` parity across directory prefixes and globs.

use super::{join_linux, pattern};

/// Verifies [`join_linux`] against `pathJoinLinux` outputs from Bit 2.2.94.
#[test]
fn join_linux_matches_node() {
    let cases: &[(&[&str], &str)] = &[
        (&["docs", "**", "*.log"], "docs/**/*.log"),
        (&["docs/sub", "keep.log/"], "docs/sub/keep.log"),
        (&[".", "**", "x"], "**/x"),
        (&["a", "../b"], "b"),
        (&["a", "/b"], "a/b"),
        (&["a", "b/"], "a/b"),
        (&["vendor/lib", "generated/"], "vendor/lib/generated"),
    ];
    for (parts, expected) in cases {
        assert_eq!(join_linux(parts), *expected, "{parts:?}");
    }
}

/// Verifies [`pattern`] against `rebaseIgnorePattern` outputs from Bit 2.2.94.
#[test]
fn rebase_matches_node() {
    let cases = [
        ("*.log", "docs", "docs/**/*.log"),
        ("!keep.log", "docs/sub", "!docs/sub/**/keep.log"),
        ("generated/", "vendor/lib", "vendor/lib/**/generated/"),
        ("/build", "pkg", "pkg/build"),
        ("src/out/", "pkg", "pkg/src/out/"),
        ("!/a/b", "x", "!x/a/b"),
    ];
    for (input, dir, expected) in cases {
        assert_eq!(pattern(input, dir), expected, "{input} in {dir}");
    }
}

/// Verifies that [`join_linux`] preserves a single `"."` path segment without stripping it.
///
/// Ensures `pathJoinLinux(["."])` parity when no trailing path segments follow `"."`.
#[test]
fn join_linux_with_single_dot_returns_dot() {
    assert_eq!(join_linux(&["."]), ".");
}

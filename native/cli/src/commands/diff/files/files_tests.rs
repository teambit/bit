//! Unit tests for unified file diff header [`format`] and dollar-pattern expansion.
//!
//! Verifies `formatFileDiff`-compatible unified headers and `JavaScript` `$` replacement pattern semantics.

use super::format;

/// Verifies that [`format`] rewrites `git diff` headers into `formatFileDiff` unified headers.
#[test]
fn formats_like_format_file_diff() {
    let diff = "diff --git a/x b/x\nindex 1..2\n--- a/x\n+++ b/x\n@@ -1 +1 @@\n-a\n+b";
    assert_eq!(
        format(diff, "1.0.0 original", "1.0.0 modified", "index.ts"),
        "--- index.ts (1.0.0 original)\n+++ index.ts (1.0.0 modified)\n@@ -1 +1 @@\n-a\n+b",
    );
    assert_eq!(format("", "a", "b", "x"), "");
    assert_eq!(format("--- a/x\n", "a", "b", "x"), "");
}

/// What `formatFileDiff` returns for a file name holding `$` patterns:
/// `$&`, `$$`, `` $` `` and `$'` expand, `$1` stays.
#[test]
fn expands_dollar_patterns() {
    let diff = "head\n--- a/x\n+++ b/x\n";
    assert_eq!(
        format(diff, "L", "R", "$&|$$|$1|$`|$'"),
        "--- --- a/x\n|$|$1||+++ +++ b/x\n|$|$1|--- --- a/x\n|$|$1||| (L)\n+++ b/x\n (R)\n (L)\n+++ b/x\n",
    );
}

/// Verifies that [`format`] preserves multiple unified diff hunks after rewriting file headers.
#[test]
fn preserves_multiple_hunks_after_rewriting_file_headers() {
    let diff = "diff --git a/f.js b/f.js\n--- a/f.js\n+++ b/f.js\n@@ -1 +1 @@\n-old1\n+new1\n@@ -10 +10 @@\n-old2\n+new2";
    let formatted = format(diff, "0.0.1", "0.0.2", "src/f.js");
    assert!(formatted.starts_with("--- src/f.js (0.0.1)\n+++ src/f.js (0.0.2)\n"));
    assert!(formatted.contains("@@ -10 +10 @@\n-old2\n+new2"));
}

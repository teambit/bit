use super::format;

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

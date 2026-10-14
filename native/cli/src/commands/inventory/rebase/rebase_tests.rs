use super::{join_linux, pattern};

/// Outputs of `pathJoinLinux` and `rebaseIgnorePattern` from bit 2.2.94.
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

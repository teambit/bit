use super::{super::FileRules, write};
use crate::workspace::rebase_ignore_pattern;
use pretty_assertions::assert_eq;
use tempfile::tempdir;

#[test]
fn component_files_apply_bit_and_user_ignore_rules() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        &[
            (".gitignore", "*.log\n# comment\n\ndist/\n"),
            ("comps/button/index.ts", ""),
            ("comps/button/button.tsx", ""),
            ("comps/button/debug.log", ""),
            ("comps/button/dist/index.js", ""),
            ("comps/button/package.json", "{}"),
            ("comps/button/component.json", "{}"),
            ("comps/button/tsconfig.json", "{}"),
            ("comps/button/nested/tsconfig.json", "{}"),
            ("comps/button/node_modules/dep/index.js", ""),
            ("comps/button/.bitmap", "{}"),
            ("comps/button/.env", ""),
            ("comps/button/.bitignore", "secret.ts\n"),
            ("comps/button/secret.ts", ""),
            ("comps/button/Z.ts", ""),
        ],
    );
    let mut rules = FileRules::load(dir.path(), &[], false).unwrap();
    let files = rules
        .component_files("comps/button", &[])
        .unwrap();
    assert_eq!(files, [".bitignore", "Z.ts", "button.tsx", "index.ts", "nested/tsconfig.json"]);
    assert!(
        rules
            .component_files("comps/missing", &[])
            .unwrap()
            .is_empty(),
    );
}

#[test]
fn track_all_files_keeps_generated_files_and_ignored_files_apply() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        &[
            ("c/index.ts", ""),
            ("c/package.json", "{}"),
            ("c/tsconfig.json", "{}"),
            ("c/x.bak", ""),
            ("c/component.json", "{}"),
        ],
    );
    let mut rules = FileRules::load(dir.path(), &["*.bak".to_owned()], true).unwrap();
    assert_eq!(
        rules.component_files("c", &[]).unwrap(),
        ["index.ts", "package.json", "tsconfig.json"],
    );
}

#[test]
fn workspace_root_component_leaves_nested_components_out_and_honors_nested_ignores() {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        &[
            (".bitmap", "{}"),
            (".gitignore", ".bitmap\n"),
            ("README.md", ""),
            ("comps/button/index.ts", ""),
            ("docs/.gitignore", "build/\n/local.env\n"),
            ("docs/guide.md", ""),
            ("docs/build/out.html", ""),
            ("docs/local.env", ""),
            ("docs/sub/local.env", ""),
            ("other/.bitmap", "{}"),
            (".git/HEAD", ""),
            (".bit/scope.json", "{}"),
        ],
    );
    let mut rules = FileRules::load(dir.path(), &[], false).unwrap();
    let files = rules
        .component_files(".", &["comps/button".to_owned()])
        .unwrap();
    assert_eq!(
        files,
        [
            ".bitmap",
            ".gitignore",
            "README.md",
            "docs/.gitignore",
            "docs/guide.md",
            "docs/sub/local.env"
        ],
    );
}

#[test]
fn rebases_nested_ignore_patterns() {
    for (pattern, expected) in [
        ("build/", "docs/sub/**/build/"),
        ("/local.env", "docs/sub/local.env"),
        ("a/b", "docs/sub/a/b"),
        ("!keep.txt", "!docs/sub/**/keep.txt"),
        ("*.log", "docs/sub/**/*.log"),
        ("x/y/", "docs/sub/x/y/"),
        ("./z", "docs/sub/z"),
        ("../up", "docs/up"),
    ] {
        assert_eq!(rebase_ignore_pattern(pattern, "docs/sub"), expected, "{pattern}");
    }
}

use super::{FastOutcome, Options, classify_workspace, parse_options};
use crate::commands::color::Chalk;
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_test_arguments_and_options() {
    assert_eq!(
        parse_options(&[
            "comp1",
            "--unmodified",
            "--coverage",
            "--junit",
            "junit.xml",
            "--env",
            "teambit.react/react",
            "--update-snapshot",
            "--json",
            "--summary",
        ]),
        Some(Options {
            user_pattern: vec!["comp1".to_owned()],
            all: false,
            scope: None,
            json: true,
        }),
    );
    assert_eq!(
        parse_options(&["-wduaj"]),
        Some(Options { user_pattern: Vec::new(), all: true, scope: None, json: true }),
    );
}

#[test]
fn handles_empty_workspace_mixed_patterns_and_unowned_files() {
    let dir = tempdir().expect("tempdir");
    let base_options = Options { user_pattern: Vec::new(), all: false, scope: None, json: false };

    fs::write(dir.path().join("workspace.jsonc"), "{}\n").expect("write workspace.jsonc");
    fs::write(dir.path().join(".bitmap"), "{}\n").expect("write .bitmap");

    let Some(FastOutcome::Empty { stdout }) =
        classify_workspace(dir.path(), dir.path(), &base_options, Chalk::new(false))
            .expect("classify empty")
    else {
        panic!("expected empty workspace output");
    };
    assert!(stdout.contains("no components found to test."));

    fs::write(dir.path().join("orphan.spec.ts"), "// test\n").expect("write orphan.spec.ts");
    let mixed = Options {
        user_pattern: vec!["orphan.spec.ts".to_owned(), "comp1".to_owned()],
        ..base_options.clone()
    };
    let Some(FastOutcome::Error(err)) =
        classify_workspace(dir.path(), dir.path(), &mixed, Chalk::new(false))
            .expect("classify mixed")
    else {
        panic!("expected mixed file and pattern error");
    };
    assert!(err.contains(
        "unable to mix test-file paths with component patterns. the following are not files: comp1"
    ),);

    let unowned =
        Options { user_pattern: vec!["orphan.spec.ts".to_owned()], ..base_options.clone() };
    let Some(FastOutcome::Error(err)) =
        classify_workspace(dir.path(), dir.path(), &unowned, Chalk::new(false))
            .expect("classify unowned")
    else {
        panic!("expected unowned file error");
    };
    assert!(err.contains(
        r#"the file "orphan.spec.ts" does not belong to any component in this workspace, unable to test it"#
    ));

    let unmatched_glob = Options { user_pattern: vec!["ui/*".to_owned()], ..base_options };
    let Some(FastOutcome::Error(err)) =
        classify_workspace(dir.path(), dir.path(), &unmatched_glob, Chalk::new(false))
            .expect("classify unmatched glob")
    else {
        panic!("expected unmatched glob error");
    };
    assert_eq!(err, r#"unable to find any component matching the "ui/*" pattern"#);
}

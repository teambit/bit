use super::{Options, Row, Wildcard, namespace_pattern, parse, report, table};
use crate::commands::color::Chalk;

#[test]
fn parses_the_native_flags() {
    assert_eq!(parse(&[]), Some(Options::default()));
    assert_eq!(
        parse(&["-i", "--json", "-s", "remote", "-n", "ui", "-l"]),
        Some(Options {
            ids: true,
            local_scope: true,
            scope: Some("remote".to_string()),
            json: true,
            namespace: Some("ui".to_string()),
        }),
    );
    for args in [
        &["remote"][..],
        &["-o"],
        &["--outdated"],
        &["-d"],
        &["-s"],
        &["-s", "-j"],
        &["-ij"],
        &["-j", "--json"],
        &["--scope=remote"],
    ] {
        assert_eq!(parse(args), None, "{args:?}");
    }
}

#[test]
fn matches_namespaces_like_the_wildcard_regex() {
    let pattern = |namespace: &str| Wildcard::new(&namespace_pattern(namespace)).unwrap();
    assert!(pattern("ui").matches("org.scope/ui/button"));
    assert!(!pattern("ui").matches("ui/button"));
    assert!(!pattern("ui").matches("org.scope/button"));
    assert!(pattern("*/ui").matches("org.scope/a/ui"));
    // `.` is any character, as in the regular expression.
    assert!(pattern("u.").matches("org.scope/ux/button"));
    assert!(Wildcard::new("**/ui+").is_err());
}

fn row(identity: &str, version: Option<&str>, used: Option<&str>) -> Row {
    Row {
        identity: identity.to_string(),
        version: version.map(str::to_string),
        deprecated: false,
        lane_readme_of: Vec::new(),
        used: used.map(str::to_string),
        root_dir: Some(format!("comps/{}", identity.rsplit('/').next().unwrap())),
    }
}

#[test]
fn renders_the_table_like_cli_table() {
    let rows = [row("remote/one", Some("0.0.1"), Some("0.0.1")), row("remote/two", None, None)];
    let expected = "found 2 components
┌──────────────┬─────────────────┬───────────────────┬───────────┐
│ component ID │ latest in scope │ used in workspace │ path      │
├──────────────┼─────────────────┼───────────────────┼───────────┤
│ remote/one   │ 0.0.1           │ 0.0.1             │ comps/one │
├──────────────┼─────────────────┼───────────────────┼───────────┤
│ remote/two   │ <new>           │ N/A               │ comps/two │
└──────────────┴─────────────────┴───────────────────┴───────────┘";
    assert_eq!(report(&rows, false, Chalk::new(false), false), expected);
    assert_eq!(report(&[], false, Chalk::new(false), false), "found 0 components\n");
    assert_eq!(
        report(&rows, true, Chalk::new(false), false),
        r#"["remote/one@0.0.1","remote/two"]"#,
    );
}

#[test]
fn colors_the_head_borders_and_multiline_ids() {
    let mut deprecated = row("remote/one", Some("0.0.1"), None);
    deprecated.deprecated = true;
    deprecated.lane_readme_of = vec!["dev".to_string()];
    let output = report(&[deprecated], false, Chalk::new(true), true);
    let lines: Vec<&str> = output.lines().collect();
    // The id column is as wide as `remote/one [Deprecated]`.
    let head_cell = format!("\u{1b}[36m component ID{} \u{1b}[39m", " ".repeat(11));
    assert!(lines[2].starts_with(&format!("\u{1b}[90m│\u{1b}[39m{head_cell}\u{1b}[90m│")));
    assert!(lines[1].starts_with("\u{1b}[90m┌──"));
    // The id cell has three lines: the id, the lane, and the empty rest.
    assert!(lines[4].contains(
        "\u{1b}[33m\u{1b}[37mremote/one\u{1b}[39m\u{1b}[33m [Deprecated]\u{1b}[39m"
    ));
    assert!(lines[5].contains("\u{1b}[33m[Lane Readme]: dev\u{1b}[39m"));
    assert_eq!(lines.len(), 8);
    let _ = table::colors(&[]);
}

#[test]
fn reads_the_current_lane_and_its_components() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(
        dir.path().join(".bitmap"),
        r#"/* header */ {
            "a": { "name": "a", "scope": "s", "version": "", "rootDir": "a" },
            "b": { "name": "b", "scope": "s", "version": "", "rootDir": "b", "isAvailableOnCurrentLane": false },
            "c": { "name": "c", "scope": "s", "version": "", "rootDir": "c", "isAvailableOnCurrentLane": false },
            "$schema-version": "17.0.0",
            "_bit_lane": { "id": { "name": "dev", "scope": "s" }, "exported": false }
        }"#,
    )
    .unwrap();
    let bitmap = super::bitmap::read(dir.path()).unwrap();
    assert_eq!(bitmap.lane, Some(serde_json::json!({"scope": "s", "name": "dev"})));
    let lane = ["s/c".to_string()];
    let on_lane: Vec<bool> = bitmap.entries
        .iter()
        .map(|entry| entry.on_current_lane(&lane))
        .collect();
    assert_eq!(on_lane, [true, false, true]);
}

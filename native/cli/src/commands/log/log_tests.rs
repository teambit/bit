use super::{
    Chalk, LocalTarget, Options, bitmap, normalize, ordered_parents, paint, parse, render,
    resolve_local_target,
};
use serde_json::json;
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_local_and_remote_history_views() {
    let options = parse(&["alpha", "--one-line", "--full-hash", "--no-color"]).unwrap();
    assert_eq!(options.id, Some("alpha"));
    assert!(options.one_line && options.full_hash);
    assert!(parse(&["acme.ui/alpha", "--remote"]).unwrap().remote);
    assert!(parse(&["alpha", "beta"]).is_none());
}

#[test]
fn resolves_local_target_from_root_dir_index_or_user_error() {
    let dir = tempdir().unwrap();
    fs::write(
        dir.path().join(".bitmap"),
        r#"{"comp1":{"name":"comp1","scope":"","version":"","mainFile":"index.ts","rootDir":"packages/comp1","defaultScope":"my-scope"}}"#,
    )
    .unwrap();
    fs::create_dir_all(dir.path().join(".bit")).unwrap();
    fs::write(
        dir.path().join(".bit/index.json"),
        r#"{"components":[{"id":{"scope":"my-scope","name":"scoped-only"},"isSymlink":false,"hash":"aaa"}]}"#,
    )
    .unwrap();
    let bm = bitmap::read(dir.path()).unwrap();
    assert_eq!(
        resolve_local_target(dir.path(), &bm, "packages/comp1", Chalk::new(false)).unwrap(),
        LocalTarget::NewComponent,
    );
    assert_eq!(
        resolve_local_target(dir.path(), &bm, "scoped-only", Chalk::new(false)).unwrap(),
        LocalTarget::Versioned { identity: "my-scope/scoped-only".into(), deprecation: None },
    );
    assert_eq!(
        resolve_local_target(dir.path(), &bm, "missing", Chalk::new(false)).unwrap(),
        LocalTarget::UserError(
            r#"error: component ID "missing" is invalid, please use the following format: [scope]/<name>"#.into()
        ),
    );
    assert_eq!(
        resolve_local_target(dir.path(), &bm, "my-scope/missing", Chalk::new(false)).unwrap(),
        LocalTarget::UserError(r#"error: component "my-scope/missing" was not found"#.into()),
    );
}

#[test]
fn remote_rows_keep_full_hash_and_message_in_one_line_output() {
    let rows = [json!({
        "message":"first\nsecond", "username":null, "email":"a@example.com",
        "date":"1800000000000", "hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "tag":null,
    })];
    let options = Options { remote: true, one_line: true, ..Options::default() };
    let report = render(&rows, &options, Chalk::new(false)).unwrap();
    let report = report.as_str().unwrap();
    assert!(report.contains("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
    assert!(report.contains("first \n"));
    assert!(report.contains("second"));
    let options = Options { remote: true, ..Options::default() };
    let report = render(&rows, &options, Chalk::new(false)).unwrap();
    assert!(
        report
            .as_str()
            .unwrap()
            .contains("author: <a@example.com>"),
    );
    assert!(
        report
            .as_str()
            .unwrap()
            .contains("date: 1800000000000"),
    );
}

#[test]
fn normalizes_a_version_log_and_renders_the_default_report() {
    let row = json!({
        "log": { "message":"initial", "date":"1800000005000", "username":"Z", "email":"z@example.com" },
        "tag":"1.0.0", "hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "parents":[],
        "onLane":false, "deleted":false,
    });
    let row = normalize(&row).unwrap();
    assert_eq!(row["tag"], "1.0.0");
    assert_eq!(row["date"].as_str().unwrap().len(), 19);
    assert!(paint(&row, Chalk::new(false)).unwrap().contains("tag 1.0.0 (aaaaaaaa"));
    let output = render(&[row], &Options::default(), Chalk::new(false)).unwrap();
    assert!(
        output
            .as_str()
            .unwrap()
            .contains("author: Z <z@example.com>"),
    );
}

#[test]
fn parents_view_delegates_when_a_hidden_parent_is_missing() {
    let head = json!({"hash":"aaaaaaaaa","parents":["bbbbbbbbb"]});
    assert!(ordered_parents(&[head]).is_err());
}

#[test]
fn parents_view_follows_history_edges_even_when_dates_are_out_of_order() {
    let logs = [
        json!({"hash":"bbbbbbbbb","parents":["aaaaaaaaa"]}),
        json!({"hash":"aaaaaaaaa","parents":[]}),
        json!({"hash":"ccccccccc","parents":["bbbbbbbbb"]}),
    ];
    let ordered = ordered_parents(&logs).unwrap();
    let hashes: Vec<_> = ordered
        .iter()
        .map(|row| row["hash"].as_str().unwrap())
        .collect();
    assert_eq!(hashes, ["ccccccccc", "bbbbbbbbb", "aaaaaaaaa"]);
}

#[test]
fn parents_view_orders_a_merge_before_both_parents() {
    let logs = [
        json!({"hash":"left","parents":["root"]}),
        json!({"hash":"right","parents":["root"]}),
        json!({"hash":"merge","parents":["right","left"]}),
        json!({"hash":"root","parents":[]}),
    ];
    let ordered = ordered_parents(&logs).unwrap();
    let hashes: Vec<_> = ordered
        .iter()
        .map(|row| row["hash"].as_str().unwrap())
        .collect();
    assert_eq!(hashes, ["merge", "right", "left", "root"]);
}

#[test]
fn deleted_and_deprecated_titles_keep_nested_published_symbol_colors() {
    let mut row = json!({"tag":"1.0.0","hash":"hash","message":"","deprecated":true});
    assert_eq!(paint(&row, Chalk::new(false)).unwrap(), "tag 1.0.0 (hash) ⚠ deprecated\n");
    assert!(
        paint(&row, Chalk::new(true))
            .unwrap()
            .contains(" \u{1b}[33m\u{1b}[33m⚠\u{1b}[39m\u{1b}[33m deprecated\u{1b}[39m"),
    );
    row["deleted"] = json!(true);
    assert_eq!(paint(&row, Chalk::new(false)).unwrap(), "tag 1.0.0 (hash) ✖ deleted\n");
    assert!(
        paint(&row, Chalk::new(true))
            .unwrap()
            .contains(" \u{1b}[31m\u{1b}[31m✖\u{1b}[39m\u{1b}[31m deleted\u{1b}[39m"),
    );
}

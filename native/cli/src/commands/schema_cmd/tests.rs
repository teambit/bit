use super::{
    Options,
    extractor::{extract_stored_schema, is_entry_modified_on_disk, match_workspace_entries},
    is_missing_host, parse_options,
};
use bit_install::workspace::Bitmap;
use serde_json::json;
use std::fs;
use tempfile::tempdir;

#[test]
fn parses_schema_options_and_detects_missing_host() {
    assert_eq!(parse_options(&[]), None);
    let opts = parse_options(&["comp1", "-j"]).expect("parse options");
    assert_eq!(opts, Options { pattern: "comp1".into(), remote: false, json: true });

    let temp = tempdir().expect("tempdir");
    assert!(is_missing_host(temp.path(), &opts));
    let remote_opts = parse_options(&["scope/comp1", "--remote"]).expect("parse remote");
    assert!(!is_missing_host(temp.path(), &remote_opts));
}

#[test]
fn matches_workspace_entries_and_extracts_stored_schema() {
    let temp = tempdir().expect("tempdir");
    fs::write(
        temp.path().join(".bitmap"),
        r#"{"bar/foo": {"scope": "my-scope", "version": "0.0.1", "mainFile": "index.ts", "rootDir": "bar/foo"}}"#,
    )
    .expect("write bitmap");
    let bitmap = Bitmap::load(temp.path(), Some("my-scope")).expect("load bitmap");
    assert_eq!(match_workspace_entries(&bitmap, "nonexistent").expect("match").len(), 0);
    assert_eq!(match_workspace_entries(&bitmap, "bar/foo").expect("match").len(), 1);
    assert_eq!(match_workspace_entries(&bitmap, "**/bar/*").expect("match").len(), 1);

    let ver_val = json!({
        "extensions": [{
            "name": "teambit.semantics/schema",
            "data": { "schema": { "__schema": "APISchema", "exports": [] } },
        }],
        "files": [],
    });
    let schema = extract_stored_schema(temp.path(), &ver_val).expect("extract schema");
    assert_eq!(schema["__schema"], "APISchema");
    assert!(is_entry_modified_on_disk(temp.path(), temp.path(), &bitmap.entries[0], &ver_val));
}

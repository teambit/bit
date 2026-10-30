use super::{
    Options,
    extractor::{
        extract_stored_schema, is_entry_modified_on_disk, match_workspace_entries,
        resolve_scope_schema_json,
    },
    is_missing_host, parse_options,
};
use bit_install::workspace::Bitmap;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use std::{fs, io::Write, path::Path};
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

#[test]
fn resolves_bare_scope_schemas_by_glob_comma_and_negation_patterns() {
    let temp = tempdir().expect("tempdir");
    let scope = temp.path();
    let comp1_hash = "1111111111111111111111111111111111111111";
    let ver1_hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let comp2_hash = "2222222222222222222222222222222222222222";
    let ver2_hash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    write_object(
        scope,
        "Component",
        comp1_hash,
        &json!({"scope":"my-scope","name":"comp1","head":ver1_hash,"versions":{"0.0.1":ver1_hash}}),
    );
    write_object(
        scope,
        "Version",
        ver1_hash,
        &json!({"extensions":[{"name":"teambit.semantics/schema","data":{"schema":{"__schema":"APISchema","id":"comp1"}}}]}),
    );
    write_object(
        scope,
        "Component",
        comp2_hash,
        &json!({"scope":"my-scope","name":"comp2","head":ver2_hash,"versions":{"0.0.1":ver2_hash}}),
    );
    write_object(
        scope,
        "Version",
        ver2_hash,
        &json!({"extensions":[{"name":"teambit.semantics/schema","data":{"schema":{"__schema":"APISchema","id":"comp2"}}}]}),
    );
    fs::write(
        scope.join("index.json"),
        serde_json::to_vec(&json!({
            "components": [
                {"id":{"scope":"my-scope","name":"comp1"},"hash":comp1_hash,"isSymlink":false},
                {"id":{"scope":"my-scope","name":"comp2"},"hash":comp2_hash,"isSymlink":false},
            ],
            "lanes": [],
        }))
        .unwrap(),
    )
    .unwrap();
    let all = resolve_scope_schema_json(scope, "my-scope/*").expect("glob match");
    assert_eq!(all.len(), 2);
    let only_first = resolve_scope_schema_json(scope, "**, !my-scope/comp2").expect("negation");
    assert_eq!(only_first, vec![json!({"__schema":"APISchema","id":"comp1"})]);
}

fn write_object(scope: &Path, kind: &str, hash: &str, body: &serde_json::Value) {
    let raw = serde_json::to_vec(body).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", raw.len()).unwrap();
    encoder.write_all(&raw).unwrap();
    let path = scope
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, encoder.finish().unwrap()).unwrap();
}

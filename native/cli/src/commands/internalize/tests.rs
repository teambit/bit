use super::{Options, is_entry_internal, parse_options};
use bit_install::workspace::Bitmap;
use std::fs;

#[test]
fn parses_internalize_flags_and_pattern() {
    assert_eq!(
        parse_options(&["comp1"]),
        Some(Options { pattern: Some("comp1".into()), revert: false, list: false, json: false }),
    );
    assert_eq!(
        parse_options(&["comp1", "-r", "-j"]),
        Some(Options { pattern: Some("comp1".into()), revert: true, list: false, json: true }),
    );
    assert_eq!(
        parse_options(&["--list", "--json", "--no-color"]),
        Some(Options { pattern: None, revert: false, list: true, json: true }),
    );
    assert_eq!(
        parse_options(&[]),
        Some(Options { pattern: None, revert: false, list: false, json: false }),
    );
    assert_eq!(parse_options(&["$internal"]), None);
    assert_eq!(parse_options(&["comp1", "comp2"]), None);
}

#[test]
fn detects_internalize_from_component_json() {
    let temp = tempfile::tempdir().unwrap();
    let root = temp.path();
    fs::create_dir_all(root.join("comp1")).unwrap();
    fs::write(root.join("comp1/index.js"), "module.exports = () => 1;\n").unwrap();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    let bitmap_raw = r#"{
        "comp1": {
            "scope": "",
            "version": "",
            "mainFile": "index.js",
            "rootDir": "comp1"
        }
    }"#;
    fs::write(root.join(".bitmap"), bitmap_raw).unwrap();
    fs::write(
        root.join("comp1/component.json"),
        r#"{
            "componentId": { "scope": "my-scope", "name": "comp1" },
            "propagate": false,
            "extensions": {
                "teambit.component/internalize": { "internal": true }
            }
        }"#,
    )
    .unwrap();
    let bitmap_val = bit_object_import::parse_jsonc(bitmap_raw.as_bytes()).unwrap();
    let bitmap = Bitmap::load(root, Some("my-scope")).unwrap();
    assert!(is_entry_internal(root, &bitmap_val, &bitmap.entries[0]).ok().unwrap());
}

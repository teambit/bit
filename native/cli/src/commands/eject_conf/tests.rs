use super::{Chalk, Options, parse_options, prepare};
use bit_install::workspace::sha1_hex;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{fs, io::Write, path::Path};
use tempfile::tempdir;

fn write_scope_object(root: &Path, kind: &str, hash: &str, payload: &Value) {
    let body = serde_json::to_vec(payload).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(format!("{kind} {hash} {}\0", body.len()).as_bytes())
        .unwrap();
    encoder.write_all(&body).unwrap();
    let compressed = encoder.finish().unwrap();
    let obj_dir = root
        .join(".bit/objects")
        .join(&hash[..2]);
    fs::create_dir_all(&obj_dir).unwrap();
    fs::write(obj_dir.join(&hash[2..]), compressed).unwrap();
}

#[test]
fn parses_eject_conf_flags_and_boolean_values() {
    assert_eq!(
        parse_options(&["bar/foo", "--propagate", "true", "--override"]),
        Some(Options {
            pattern: "bar/foo".into(),
            propagate: true,
            override_existing: true,
            json: false,
        }),
    );
    assert_eq!(
        parse_options(&["comp1", "-p", "-j"]),
        Some(Options {
            pattern: "comp1".into(),
            propagate: true,
            override_existing: false,
            json: true,
        }),
    );
    assert_eq!(parse_options(&[]), None);
}

#[test]
fn prepares_ejected_config_for_versioned_component_from_scope_objects() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(
        root.join(".bitmap"),
        r#"{
  "bar": {
    "scope": "my-scope",
    "version": "0.0.1",
    "mainFile": "index.js",
    "rootDir": "bar",
    "config": {
      "teambit.pkg/pkg": { "packageJson": { "private": true } }
    }
  }
}"#,
    )
    .unwrap();
    fs::create_dir_all(root.join("bar")).unwrap();
    let ver_hash = "0123456789abcdef0123456789abcdef01234567";
    let version_json = json!({
        "extensions": [
            {
                "name": "teambit.dependencies/dependency-resolver",
                "config": { "policy": { "dependencies": { "lodash": "4.17.21" } }, "__specific": true }
            }
        ]
    });
    write_scope_object(root, "Version", ver_hash, &version_json);
    let model_hash = sha1_hex("my-scope/bar");
    let model_json = json!({
        "name": "bar",
        "scope": "my-scope",
        "versions": { "0.0.1": ver_hash }
    });
    write_scope_object(root, "Component", &model_hash, &model_json);
    let opts =
        Options { pattern: "bar".into(), propagate: false, override_existing: false, json: false };
    let prepared = prepare(root, &opts, Chalk::new(false)).unwrap();
    assert!(prepared.bitmap_changed);
    assert_eq!(prepared.files.len(), 1);
    let comp_json: Value = serde_json::from_slice(&prepared.files[0].bytes).unwrap();
    assert_eq!(
        comp_json["componentId"],
        json!({ "scope": "my-scope", "name": "bar", "version": "0.0.1" }),
    );
    assert_eq!(
        comp_json["extensions"]["teambit.pkg/pkg"],
        json!({ "packageJson": { "private": true } }),
    );
    assert_eq!(
        comp_json["extensions"]["teambit.dependencies/dependency-resolver"],
        json!({ "policy": { "dependencies": { "lodash": "4.17.21" } } }),
    );
}

#[test]
fn merges_existing_non_empty_component_json_when_override_is_enabled() {
    let temp = tempdir().unwrap();
    let root = temp.path();
    fs::write(
        root.join("workspace.jsonc"),
        r#"{ "teambit.workspace/workspace": { "defaultScope": "my-scope" } }"#,
    )
    .unwrap();
    fs::write(
        root.join(".bitmap"),
        r#"{
  "bar": {
    "scope": "my-scope",
    "version": "0.0.1",
    "mainFile": "index.js",
    "rootDir": "bar",
    "config": {
      "teambit.pkg/pkg": { "packageJson": { "private": true } }
    }
  }
}"#,
    )
    .unwrap();
    fs::create_dir_all(root.join("bar")).unwrap();
    fs::write(
        root.join("bar/component.json"),
        serde_json::to_vec_pretty(&json!({
            "componentId": { "scope": "my-scope", "name": "bar", "version": "0.0.1" },
            "propagate": false,
            "extensions": {
                "teambit.envs/envs": { "env": "teambit.harmony/node" }
            }
        }))
        .unwrap(),
    )
    .unwrap();
    let ver_hash = "0123456789abcdef0123456789abcdef01234567";
    let version_json = json!({
        "extensions": [
            {
                "name": "teambit.dependencies/dependency-resolver",
                "config": { "policy": { "dependencies": { "lodash": "4.17.21" } } }
            }
        ]
    });
    write_scope_object(root, "Version", ver_hash, &version_json);
    let model_hash = sha1_hex("my-scope/bar");
    let model_json = json!({
        "name": "bar",
        "scope": "my-scope",
        "versions": { "0.0.1": ver_hash }
    });
    write_scope_object(root, "Component", &model_hash, &model_json);
    let opts =
        Options { pattern: "bar".into(), propagate: true, override_existing: true, json: false };
    let prepared = prepare(root, &opts, Chalk::new(false)).unwrap();
    let comp_json: Value = serde_json::from_slice(&prepared.files[0].bytes).unwrap();
    assert_eq!(comp_json["propagate"], json!(true));
    assert_eq!(
        comp_json["extensions"],
        json!({
            "teambit.pkg/pkg": { "packageJson": { "private": true } },
            "teambit.envs/envs": { "env": "teambit.harmony/node" }
        }),
    );
}

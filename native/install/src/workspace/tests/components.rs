use super::write;
use crate::{
    config::WorkspaceConfig,
    workspace::{Bitmap, Workspace, sha1_hex},
};
use flate2::{Compression, write::ZlibEncoder};
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use std::{fs, io::Write, path::Path};
use tempfile::tempdir;

const CORE: [&str; 8] = [
    "teambit.envs/envs",
    "teambit.envs/env",
    "teambit.react/react",
    "teambit.harmony/aspect",
    "teambit.pkg/pkg",
    "teambit.dependencies/dependency-resolver",
    "teambit.component/remove",
    "teambit.workspace/workspace",
];

fn core() -> Vec<String> {
    CORE.iter()
        .map(|id| (*id).to_owned())
        .collect()
}

/// Write a scope object the way Bit does: `<type> <hash> <size>\0<json>`, deflated.
fn write_object(scope: &Path, hash: &str, kind: &str, body: &Value) {
    let body = body.to_string();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(format!("{kind} {hash} {}\0{body}", body.len()).as_bytes())
        .unwrap();
    let dir = scope.join("objects").join(&hash[..2]);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join(&hash[2..]), encoder.finish().unwrap()).unwrap();
}

const BITMAP: &str = r#"/**
 * The Bitmap file is an auto generated file used by Bit to track all your Bit components.
 */
{
    "button": {
        "name": "button",
        "scope": "",
        "version": "",
        "defaultScope": "org.local",
        "mainFile": "index.ts",
        "rootDir": "comps/button",
        "config": {
            "teambit.dependencies/dependency-resolver": { "policy": { "dependencies": { "lodash": "4" } } }
        }
    },
    "special": { "name": "special", "scope": "", "version": "", "mainFile": "index.ts", "rootDir": "comps/special" },
    "my-env": {
        "name": "my-env",
        "scope": "",
        "version": "",
        "defaultScope": "org.local",
        "mainFile": "index.ts",
        "rootDir": "envs/my-env",
        "config": { "teambit.envs/envs": { "env": "teambit.envs/env" }, "teambit.envs/env": {} }
    },
    "org.remote/imported": {
        "name": "imported",
        "scope": "org.remote",
        "version": "1.0.0",
        "mainFile": "index.ts",
        "rootDir": "remote/imported"
    },
    "gone": {
        "name": "gone",
        "scope": "",
        "version": "",
        "mainFile": "index.ts",
        "rootDir": "comps/gone",
        "isAvailableOnCurrentLane": false,
        "config": { "teambit.component/remove": { "removed": true } }
    },
    "_bit_lane": { "id": { "name": "dev", "scope": "org.local" }, "exported": true },
    "$schema-version": "17.0.0"
}"#;

fn workspace() -> (tempfile::TempDir, Workspace) {
    let dir = tempdir().unwrap();
    write(
        dir.path(),
        &[
            (
                "workspace.jsonc",
                r#"{
  "teambit.workspace/workspace": { "defaultScope": "org.local" },
  "teambit.workspace/variants": {
    "*": { "teambit.envs/envs": { "env": "teambit.react/react" }, "teambit.react/react": {} },
    "comps": { "teambit.dependencies/dependency-resolver": { "policy": { "dependencies": { "x": "1" } } } }
  }
}"#,
            ),
            (".bitmap", BITMAP),
            ("package.json", r#"{ "name": "root", "dependencies": { "a": "1" } }"#),
            ("comps/button/index.ts", ""),
            ("comps/special/index.ts", ""),
            (
                "comps/special/component.json",
                r#"{ "componentId": { "scope": "org.local", "name": "special" }, "extensions": { "teambit.envs/envs": { "env": "org.local/my-env" }, "org.local/my-env": {}, "teambit.react/react": "-" } }"#,
            ),
            ("envs/my-env/index.ts", ""),
            ("envs/my-env/env.jsonc", "{}"),
            ("remote/imported/index.ts", ""),
        ],
    );
    let scope = dir.path().join(".bit");
    let version_hash = sha1_hex("version");
    let model_hash = sha1_hex("org.remote/imported");
    write_object(
        &scope,
        &model_hash,
        "Component",
        &json!({
            "name": "imported", "scope": "org.remote", "bindingPrefix": "@org", "versions": { "1.0.0": version_hash }
        }),
    );
    write_object(
        &scope,
        &version_hash,
        "Version",
        &json!({ "extensions": [
            { "name": "teambit.envs/envs", "config": { "env": "teambit.harmony/aspect" }, "data": {} },
            { "name": "teambit.harmony/aspect", "config": {}, "data": {} },
            { "name": "teambit.pkg/pkg", "config": { "__specific": true, "packageJson": { "name": "custom-{name}" } }, "data": {} },
            { "extensionId": { "scope": "org.remote", "name": "some-aspect", "version": "2.0.0" }, "config": { "k": 1 }, "data": {} }
        ]}),
    );
    let config = WorkspaceConfig::load(dir.path()).unwrap();
    let workspace = Workspace::load(dir.path(), &config, &core()).unwrap();
    (dir, workspace)
}

#[test]
fn loads_bitmap_entries() {
    let (dir, workspace) = workspace();
    assert_eq!(workspace.scope_path, dir.path().join(".bit"));
    assert_eq!(
        workspace.lane
            .as_ref()
            .map(|lane| (lane.id(), lane.exported)),
        Some(("org.local/dev".to_owned(), true)),
    );
    let names: Vec<_> = workspace.components
        .iter()
        .map(|component| component.id.name.as_str())
        .collect();
    assert_eq!(names, ["button", "special", "my-env", "imported", "gone"]);
    let special = &workspace.components[1];
    assert_eq!(
        special.id.default_scope.as_deref(),
        Some("org.local"),
        "falls back to the workspace default scope",
    );
    let gone = &workspace.entries[4];
    assert!(gone.is_removed() && !gone.owns_its_dir());
    assert_eq!(workspace.active().count(), 4);
    assert_eq!(workspace.root_package_json.as_ref().unwrap()["name"], json!("root"));
    assert!(workspace.root_component().is_none());
}

#[test]
fn merges_component_config_in_bit_precedence() {
    let (dir, workspace) = workspace();
    let button = &workspace.components[0];
    assert_eq!(button.dir, dir.path().join("comps/button"));
    assert_eq!(button.files, ["index.ts"]);
    assert_eq!(button.env_id, "teambit.react/react");
    assert_eq!(button.package_name, "@org/local.button");
    // `.bitmap` config wins over the matching variant.
    assert_eq!(
        button.config["teambit.dependencies/dependency-resolver"],
        json!({ "policy": { "dependencies": { "lodash": "4" } } }),
    );
    // component.json without `propagate` stops variants; its "-" removes the aspect.
    let special = &workspace.components[1];
    assert_eq!(special.env_id, "org.local/my-env");
    assert!(!special.config.contains_key("teambit.react/react"));
    assert!(!special.config.contains_key("teambit.dependencies/dependency-resolver"));
    let env = &workspace.components[2];
    assert_eq!(env.env_id, "teambit.envs/env");
    assert!(env.is_env);
    assert!(!button.is_env && !button.has_package_json);
}

#[test]
fn reads_model_aspects_and_binding_prefix_from_the_scope() {
    let (_dir, workspace) = workspace();
    let imported = &workspace.components[3];
    // the variant's env, set before the model's non-specific aspects, wins.
    assert_eq!(imported.env_id, "teambit.react/react");
    assert!(!imported.config.contains_key("teambit.harmony/aspect"));
    assert_eq!(
        imported.config["teambit.pkg/pkg"],
        json!({ "packageJson": { "name": "custom-{name}" } }),
    );
    assert_eq!(imported.config["org.remote/some-aspect@2.0.0"], json!({ "k": 1 }));
    assert_eq!(imported.package_name, "custom-imported");
}

#[test]
fn bitmap_errors() {
    let dir = tempdir().unwrap();
    assert!(Bitmap::load(dir.path(), None).unwrap().entries.is_empty());
    for bitmap in [
        r#"{ "a": { "name": "a", "mainFile": "i.ts", "rootDir": "a" } }"#,
        r#"{ "a": { "name": "a", "scope": "s", "version": "", "mainFile": "i.ts", "rootDir": "a" } }"#,
        r#"{ "a": { "scope": "", "rootDir": "x" }, "b": { "scope": "", "rootDir": "x" } }"#,
    ] {
        fs::write(dir.path().join(".bitmap"), bitmap).unwrap();
        assert!(Bitmap::load(dir.path(), None).is_err(), "{bitmap}");
    }
    fs::write(
        dir.path().join(".bitmap"),
        r#"{ "x/y": { "scope": "", "version": "", "rootDir": "y" } }"#,
    )
    .unwrap();
    let bitmap = Bitmap::load(dir.path(), Some("d")).unwrap();
    assert_eq!(bitmap.entries[0].id.name, "x/y");
    assert_eq!(bitmap.entries[0].id.default_scope.as_deref(), Some("d"));
    assert!(bitmap.entries[0].lanes.available_on_current_lane);
}

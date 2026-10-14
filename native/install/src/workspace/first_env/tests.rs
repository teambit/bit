use super::resolve;
use crate::{
    model::{ComponentId, WorkspaceComponent},
    workspace::{scope_model::ScopeObjects, sha1_hex},
};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Map, Value, json};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

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

fn component(name: &str, env_id: &str, is_env: bool, config: &Value) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: Some("org.scope".into()),
            default_scope: None,
            name: name.into(),
            version: None,
        },
        root_dir: name.into(),
        dir: PathBuf::from(name),
        files: Vec::new(),
        main_file: "index.ts".into(),
        package_name: format!("@org/scope.{name}"),
        env_id: env_id.into(),
        is_env,
        has_package_json: false,
        config: config
            .as_object()
            .cloned()
            .unwrap_or_else(Map::new),
    }
}

#[test]
fn the_first_configured_env_component_is_the_env() {
    let scope = tempfile::tempdir().unwrap();
    let mut components = vec![
        component("my-env", "teambit.envs/env", true, &json!({})),
        component(
            "comp",
            "teambit.harmony/node",
            false,
            &json!({
                "teambit.pkg/pkg": {},
                "org.scope/some-aspect": {},
                "org.scope/my-env": {}
            }),
        ),
    ];
    let core = vec!["teambit.pkg/pkg".to_owned()];
    resolve(&mut components, &ScopeObjects::new(scope.path()), &core).unwrap();
    assert_eq!(components[1].env_id, "org.scope/my-env");
}

#[test]
fn a_configured_env_wins() {
    let scope = tempfile::tempdir().unwrap();
    let mut components = vec![
        component("my-env", "teambit.envs/env", true, &json!({})),
        component(
            "comp",
            "teambit.harmony/node",
            false,
            &json!({
                "teambit.envs/envs": { "env": "teambit.harmony/node" },
                "org.scope/my-env": {}
            }),
        ),
    ];
    resolve(&mut components, &ScopeObjects::new(scope.path()), &[]).unwrap();
    assert_eq!(components[1].env_id, "teambit.harmony/node");
}

#[test]
fn an_aspect_from_the_scope_with_an_env_manifest_is_the_env() {
    let scope = tempfile::tempdir().unwrap();
    let version_hash = sha1_hex("version");
    write_object(
        scope.path(),
        &sha1_hex("org.remote/my-env"),
        "Component",
        &json!({ "name": "my-env", "scope": "org.remote", "head": version_hash, "versions": { "1.0.0": version_hash } }),
    );
    write_object(
        scope.path(),
        &version_hash,
        "Version",
        &json!({ "extensions": [], "files": [{ "relativePath": "env.jsonc", "file": "abc" }] }),
    );
    let mut components = vec![component(
        "comp",
        "teambit.harmony/node",
        false,
        &json!({ "org.remote/other-aspect": {}, "org.remote/my-env@1.0.0": {} }),
    )];
    resolve(&mut components, &ScopeObjects::new(scope.path()), &[]).unwrap();
    assert_eq!(components[0].env_id, "org.remote/my-env@1.0.0");
    let mut unversioned =
        vec![component("comp", "teambit.harmony/node", false, &json!({ "org.remote/my-env": {} }))];
    resolve(&mut unversioned, &ScopeObjects::new(scope.path()), &[]).unwrap();
    assert_eq!(
        unversioned[0].env_id, "org.remote/my-env",
        "the head stands in for a missing version",
    );
}

use super::aspect_env_ids;
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

fn component(name: &str, version: Option<&str>, env_id: &str) -> WorkspaceComponent {
    WorkspaceComponent {
        id: ComponentId {
            scope: Some("org.scope".into()),
            default_scope: None,
            name: name.into(),
            version: version.map(str::to_owned),
        },
        root_dir: name.into(),
        dir: PathBuf::from(name),
        files: Vec::new(),
        main_file: "index.ts".into(),
        package_name: format!("@org/scope.{name}"),
        env_id: env_id.into(),
        is_env: false,
        has_package_json: false,
        config: Map::new(),
    }
}

#[test]
fn envs_whose_components_store_an_aspect_descriptor_are_aspect_envs() {
    let scope = tempfile::tempdir().unwrap();
    let version_hash = sha1_hex("version");
    write_object(
        scope.path(),
        &sha1_hex("org.scope/my-aspect"),
        "Component",
        &json!({ "name": "my-aspect", "scope": "org.scope", "versions": { "1.0.0": version_hash } }),
    );
    write_object(
        scope.path(),
        &version_hash,
        "Version",
        &json!({ "extensions": [
            { "name": "teambit.envs/envs", "config": { "env": "org.scope/custom-aspect-env" }, "data": { "type": "aspect", "id": "org.scope/custom-aspect-env" } }
        ] }),
    );
    let components = [
        component("my-aspect", Some("1.0.0"), "org.scope/custom-aspect-env@2.0.0"),
        component("fresh", None, "org.scope/another-env"),
    ];
    let ids =
        aspect_env_ids(&components, &ScopeObjects::new(scope.path()), &["teambit.harmony/aspect"])
            .unwrap();
    assert_eq!(ids, ["teambit.harmony/aspect", "org.scope/custom-aspect-env@2.0.0"]);
}

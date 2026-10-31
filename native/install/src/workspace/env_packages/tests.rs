use super::external_env_packages;
use crate::{
    policy::tests::component,
    workspace::{ScopeObjects, sha1_hex},
};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{fs, io::Write, path::Path};

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

/// The scope holds `org.remote/envs/my-env@1.0.0`, published under a custom name.
fn scope() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let version_hash = sha1_hex("version");
    write_object(
        dir.path(),
        &sha1_hex("org.remote/envs/my-env"),
        "Component",
        &json!({
            "name": "envs/my-env",
            "scope": "org.remote",
            "head": version_hash,
            "versions": { "1.0.0": version_hash },
        }),
    );
    write_object(
        dir.path(),
        &version_hash,
        "Version",
        &json!({ "extensions": [
            { "name": "teambit.pkg/pkg", "config": { "packageJson": { "name": "custom-{name}" } }, "data": {} }
        ] }),
    );
    dir
}

#[test]
fn an_external_env_is_named_by_its_stored_pkg_config() {
    let scope = scope();
    let root = Path::new("/ws");
    let components = [
        component(root, "org.scope/ui/button", "org.remote/envs/my-env@1.0.0"),
        component(root, "org.scope/ui/card", "org.remote/envs/my-env@1.0.0"),
        component(root, "org.scope/utils", "org.other/envs/unknown@2.0.0"),
        component(root, "org.scope/react-ui", "teambit.react/react"),
    ];
    let packages = external_env_packages(&components, &ScopeObjects::new(scope.path())).unwrap();
    assert_eq!(
        packages.into_iter().collect::<Vec<_>>(),
        [
            ("org.remote/envs/my-env".to_owned(), "custom-envs.my-env".to_owned()),
            ("org.other/envs/unknown".to_owned(), "@org/other.envs.unknown".to_owned()),
        ],
    );
}

#[test]
fn a_workspace_env_is_not_external() {
    let scope = tempfile::tempdir().unwrap();
    let root = Path::new("/ws");
    let components = [
        component(root, "org.scope/ui/button", "org.scope/envs/my-env"),
        component(root, "org.scope/envs/my-env", "teambit.envs/env"),
    ];
    let packages = external_env_packages(&components, &ScopeObjects::new(scope.path())).unwrap();
    assert!(packages.is_empty());
}

use super::{ScopeObjects, sha1_hex};
use crate::model::ComponentId;
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

fn id(version: Option<&str>) -> ComponentId {
    ComponentId {
        scope: Some("org.remote".into()),
        default_scope: None,
        name: "envs/my-env".into(),
        version: version.map(str::to_owned),
    }
}

/// A model with a tagged head Version carrying `extensions`.
fn scope(extensions: &Value, files: &Value) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let version_hash = sha1_hex("version");
    write_object(
        dir.path(),
        &sha1_hex("org.remote/envs/my-env"),
        "Component",
        &json!({
            "name": "envs/my-env",
            "scope": "org.remote",
            "bindingPrefix": "@org",
            "head": version_hash,
            "versions": { "1.0.0": version_hash }
        }),
    );
    write_object(
        dir.path(),
        &version_hash,
        "Version",
        &json!({ "extensions": extensions, "files": files }),
    );
    dir
}

#[test]
fn reads_files_and_the_env_descriptor_type() {
    let dir = scope(
        &json!([{ "name": "teambit.envs/envs", "config": {}, "data": { "type": "aspect", "id": "teambit.harmony/aspect" } }]),
        &json!([{ "relativePath": "env.jsonc", "file": "abc" }, { "relativePath": "index.ts", "file": "def" }]),
    );
    let model = ScopeObjects::new(dir.path())
        .component(&id(Some("1.0.0")))
        .unwrap()
        .unwrap();
    assert_eq!(model.files, ["env.jsonc", "index.ts"]);
    assert!(model.has_env_manifest());
    assert!(model.uses_aspect_env());
}

#[test]
fn an_id_without_version_reads_the_head() {
    let dir = scope(&json!([]), &json!([{ "relativePath": "env.json", "file": "abc" }]));
    let objects = ScopeObjects::new(dir.path());
    assert!(
        objects
            .component(&id(None))
            .unwrap()
            .is_none(),
        "component() needs a version",
    );
    let head = objects
        .component_or_head(&id(None))
        .unwrap()
        .unwrap();
    assert!(head.has_env_manifest());
    assert!(!head.uses_aspect_env());
    let unknown = ComponentId { name: "missing".into(), ..id(None) };
    assert!(
        objects
            .component_or_head(&unknown)
            .unwrap()
            .is_none(),
    );
}

#[test]
fn package_name_prefers_the_stored_dependency_resolver_data() {
    let dir = scope(
        &json!([
            { "name": "teambit.dependencies/dependency-resolver", "config": {}, "data": { "packageName": "@org/stored.name" } },
            { "name": "teambit.pkg/pkg", "config": { "packageJson": { "name": "custom-{name}" } }, "data": {} }
        ]),
        &json!([]),
    );
    let model = ScopeObjects::new(dir.path())
        .component_or_head(&id(None))
        .unwrap()
        .unwrap();
    assert_eq!(model.package_name(&id(None)), "@org/stored.name");
}

#[test]
fn package_name_falls_back_to_the_pkg_config_and_binding_prefix() {
    let custom = scope(
        &json!([{ "name": "teambit.pkg/pkg", "config": { "packageJson": { "name": "custom-{name}" } }, "data": {} }]),
        &json!([]),
    );
    let model = ScopeObjects::new(custom.path())
        .component_or_head(&id(None))
        .unwrap()
        .unwrap();
    assert_eq!(model.package_name(&id(None)), "custom-envs.my-env");
    let plain = scope(&json!([]), &json!([]));
    let model = ScopeObjects::new(plain.path())
        .component_or_head(&id(None))
        .unwrap()
        .unwrap();
    assert_eq!(model.package_name(&id(None)), "@org/remote.envs.my-env");
}

#[test]
fn index_lookup_supports_jsonc_and_string_component_ids() {
    let dir = scope(&json!([]), &json!([{ "relativePath": "env.jsonc", "file": "abc" }]));
    let custom_hash = sha1_hex("custom-indexed-model");
    let version_hash = sha1_hex("version");
    write_object(
        dir.path(),
        &custom_hash,
        "Component",
        &json!({
            "name": "envs/my-env",
            "scope": "org.remote",
            "bindingPrefix": "@custom",
            "head": version_hash,
            "versions": { "1.0.0": version_hash }
        }),
    );
    fs::write(
        dir.path().join("index.json"),
        format!(
            "// comment in index.json\n{{\"components\":[{{\"id\":\"org.remote/envs/my-env\",\"isSymlink\":false,\"hash\":\"{custom_hash}\",}},],}}",
        ),
    )
    .unwrap();
    let model = ScopeObjects::new(dir.path())
        .component_or_head(&id(None))
        .unwrap()
        .unwrap();
    assert_eq!(model.binding_prefix.as_deref(), Some("@custom"));
}

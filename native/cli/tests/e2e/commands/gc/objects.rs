//! Start from real exported metadata, then add isolated graph branches for the collector oracle.
use crate::helper::Helper;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub(super) fn digest(value: &str) -> String {
    format!("{:x}", Sha1::digest(value.as_bytes()))
}
pub(super) fn path(scope: &Path, directory: &str, hash: &str) -> PathBuf {
    scope
        .join(directory)
        .join(&hash[..2])
        .join(&hash[2..])
}
pub(super) fn write(scope: &Path, kind: &str, hash: &str, body: &[u8]) {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body).unwrap();
    let path = path(scope, "objects", hash);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, encoder.finish().unwrap()).unwrap();
}
fn write_json(scope: &Path, kind: &str, hash: &str, body: &Value) {
    write(scope, kind, hash, &serde_json::to_vec(body).unwrap());
}
pub(super) fn dependency_graph(helper: &Helper) -> (Vec<String>, Vec<String>) {
    let scope = &helper.scopes.remote_path;
    let model_hash = digest(&format!("{}/comp1", helper.scopes.remote));
    let (_, model) = bit_object_import::read_scope_object(scope, &model_hash).unwrap().unwrap();
    let head = model["head"].as_str().unwrap();
    let (_, mut version) = bit_object_import::read_scope_object(scope, head).unwrap().unwrap();
    let (old, current) = dependency_versions(scope, &version);
    let mut dependency = model.clone();
    dependency["name"] = json!("dependency");
    dependency["scope"] = json!("fixture.foreign");
    dependency["versions"] = json!({"0.0.1":old[0],"0.0.2":current[0]});
    dependency["head"] = json!(current[0]);
    let dependency_hash = digest("fixture.foreign/dependency");
    write_json(scope, "Component", &dependency_hash, &dependency);
    let flattened = digest("flattened dependency source");
    write(scope, "Source", &flattened, br#"["fixture.foreign/dependency@0.0.2"]"#);
    version["flattenedDependenciesRef"] = json!(flattened);
    write_json(scope, "Version", head, &version);
    let mut kept = current;
    kept.extend([dependency_hash, flattened]);
    (old, kept)
}
fn dependency_versions(scope: &Path, original: &Value) -> (Vec<String>, Vec<String>) {
    let mut version = original.clone();
    let old = [digest("old dependency version"), digest("old dependency source")];
    let current = [digest("current dependency version"), digest("current dependency source")];
    version["flattenedDependencies"] = json!([]);
    version
        .as_object_mut()
        .unwrap()
        .shift_remove("flattenedDependenciesRef");
    version["parents"] = json!([]);
    version["files"][0]["file"] = json!(old[1]);
    write(scope, "Source", &old[1], b"old dependency source");
    write_json(scope, "Version", &old[0], &version);
    version["parents"] = json!([old[0]]);
    version["files"][0]["file"] = json!(current[1]);
    write(scope, "Source", &current[1], b"current dependency source");
    write_json(scope, "Version", &current[0], &version);
    (old.to_vec(), current.to_vec())
}

pub(super) fn alias_graph(helper: &Helper, boxed: bool) -> (Vec<String>, Vec<String>) {
    let scope = &helper.scopes.remote_path;
    let (mut deleted, mut kept) = dependency_graph(helper);
    let name = if boxed { "legacy/dependency" } else { "dependency" };
    if boxed {
        box_model(scope, &mut kept);
    }
    let alias = digest(&format!("fixture.alias/{name}"));
    let mut value =
        json!({"scope":"fixture.alias","name":"dependency","realScope":"fixture.foreign"});
    if boxed {
        value["box"] = json!("legacy");
    }
    write_json(scope, "Symlink", &alias, &value);
    let flattened = digest("flattened dependency source");
    write(
        scope,
        "Source",
        &flattened,
        &serde_json::to_vec(&json!([format!("fixture.alias/{name}@0.0.2")])).unwrap(),
    );
    deleted.push(alias);
    (deleted, kept)
}
fn box_model(scope: &Path, kept: &mut Vec<String>) {
    let previous = digest("fixture.foreign/dependency");
    let (_, mut model) = bit_object_import::read_scope_object(scope, &previous).unwrap().unwrap();
    model["box"] = json!("legacy");
    let hash = digest("fixture.foreign/legacy/dependency");
    write_json(scope, "Component", &hash, &model);
    fs::remove_file(path(scope, "objects", &previous)).unwrap();
    kept.retain(|hash| hash != &previous);
    kept.push(hash);
}

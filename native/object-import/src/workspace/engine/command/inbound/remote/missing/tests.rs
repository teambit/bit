use super::requests;
use crate::validate::hexadecimal;
use bit_client_transfer::tar::ObjectItem;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use sha1::Digest;
use std::{io::Write, path::Path};

/// A Bit object as a remote sends it: `<kind> <hash> <size>\0<json>`, zlib compressed.
fn object(kind: &str, hash: &str, body: &Value) -> ObjectItem {
    let body = body.to_string();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0{body}", body.len()).unwrap();
    ObjectItem { hash: hash.to_owned(), compressed: encoder.finish().unwrap(), scope: None }
}

/// The `ModelComponent` of `scope/name` with one tag, and that tag's Version.
fn component(id: &str, version_hash: &str, version: &Value) -> [ObjectItem; 2] {
    let model_hash = hexadecimal(&sha1::Sha1::digest(id.as_bytes()));
    let model = json!({"head": version_hash, "versions": {"1.0.0": version_hash}});
    [object("Component", &model_hash, &model), object("Version", version_hash, version)]
}

const APP: &str = "1111111111111111111111111111111111111111";
const DEPENDENCY: &str = "2222222222222222222222222222222222222222";

fn app(version: &Value) -> Vec<ObjectItem> {
    component("acme.app/app", APP, version).into()
}

fn requested(items: &[ObjectItem]) -> Vec<String> {
    let ids = ["acme.app/app@latest".to_owned()];
    requests(items, &ids, Path::new("/nonexistent"))
}

#[test]
fn a_version_with_a_dependency_graph_needs_nothing_more() {
    let dependencies = json!(["acme.lib/lib@1.0.0"]);
    let version =
        json!({"flattenedDependencies": dependencies, "flattenedEdges": [{"source": {}}]});
    assert!(requested(&app(&version)).is_empty());
}

#[test]
fn present_and_built_dependencies_need_nothing_more() {
    let version = json!({"flattenedDependencies": [{"scope": "acme.lib", "name": "lib", "version": "1.0.0"}]});
    let mut items = app(&version);
    items.extend(component("acme.lib/lib", DEPENDENCY, &json!({"buildStatus": "succeed"})));
    assert!(requested(&items).is_empty());
}

#[test]
fn missing_or_unbuilt_dependencies_are_fetched_with_the_dependent() {
    let version = json!({"flattenedDependencies": ["acme.lib/lib@1.0.0"]});
    assert_eq!(requested(&app(&version)), ["acme.app/app@latest"]);
    let mut items = app(&version);
    items.extend(component("acme.lib/lib", DEPENDENCY, &json!({"buildStatus": "pending"})));
    assert_eq!(requested(&items), ["acme.app/app@latest"]);
}

#[test]
fn a_component_the_remote_did_not_return_is_requested_again() {
    assert_eq!(requested(&[]), ["acme.app/app@latest"]);
}

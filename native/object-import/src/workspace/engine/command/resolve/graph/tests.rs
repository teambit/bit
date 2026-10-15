use super::edges;
use serde_json::json;

#[test]
fn aspect_edges_override_lifecycle_without_reordering_existing_dependency() {
    let root = json!({"scope":"scope","name":"root","version":"old"});
    let aspect = json!({"scope":"scope","name":"aspect","version":"1.0.0"});
    let other = json!({"scope":"scope","name":"other","version":"2.0.0"});
    let version = json!({"dependencies":[{"id":aspect},{"id":other}],"devDependencies":[],
        "extensions":[{"extensionId":aspect},{"name":"teambit.envs/envs"}]});
    let actual = edges(&root, &version).unwrap();
    assert_eq!(
        actual,
        vec![
            json!({"source":root,"target":aspect,"type":"ext"}),
            json!({"source":root,"target":other,"type":"prod"})
        ],
    );
}

#[test]
fn malformed_component_aspect_identity_is_not_silently_dropped() {
    let root = json!({"scope":"scope","name":"root","version":"old"});
    let version = json!({"dependencies":[],"devDependencies":[],
        "extensions":[{"extensionId":{"scope":"scope","name":"aspect"}}]});
    assert!(edges(&root, &version).is_err());
}

#[test]
fn saved_graph_leaf_does_not_require_external_model_or_version_objects() {
    let directory = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let mut repository = super::Repository::new(&directory.0, None);
    let external = json!({"scope":"external.scope","name":"aspect","version":"0.4.12"});
    let old = json!({"scope":"scope","name":"root","version":"old"});
    let version = json!({"dependencies":[{"id":external}],"devDependencies":[],"extensions":[]});
    let mut graph = super::saved::Graph::new();
    super::saved::append(&mut graph, &json!([{"source":old,"target":external,"type":"prod"}]))
        .unwrap();
    let versions = std::collections::HashMap::from([("scope/root".to_owned(), version.clone())]);
    let (flattened, edges) =
        super::traverse("scope/root", &version, &versions, &graph, &mut repository).unwrap();
    assert_eq!(flattened, vec![external.clone()]);
    assert_eq!(edges[0]["target"], external);
    assert!(!directory.0.join(".bit/objects").exists());
}

#[test]
fn retained_graph_cycle_declines_before_prior_selected_version_can_be_rewritten() {
    let directory = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let mut repository = super::Repository::new(&directory.0, None);
    let external = json!({"scope":"scope","name":"external","version":"1.0.0"});
    let old = json!({"scope":"scope","name":"root","version":"old"});
    let version = json!({"dependencies":[{"id":external}],"devDependencies":[],"extensions":[]});
    let mut graph = super::saved::Graph::new();
    super::saved::append(
        &mut graph,
        &json!([
            {"source":old,"target":external,"type":"prod"},
            {"source":external,"target":old,"type":"ext"}
        ]),
    )
    .unwrap();
    let versions = std::collections::HashMap::from([("scope/root".to_owned(), version.clone())]);
    let error =
        super::traverse("scope/root", &version, &versions, &graph, &mut repository).unwrap_err();
    assert_eq!(error.to_string(), "resolve retained graph reaches prior batch version");
}

//! Unit tests for stash cross-component flattened dependency graph [`traverse`], [`key`], and [`Repository`] lookup in `bit-object-import`.
//!
//! Ensures stashed dependency graphs in [`HashMap`] inputs via [`traverse`], [`key`], and [`Repository`] ([`cross_component_graph_uses_existing_versions_instead_of_new_snapshot_markers`], [`isolated_component_without_dependencies_produces_empty_flattened_list_and_graph`]) reference existing component versions.

use super::{HashMap, Repository, key, traverse};
use serde_json::json;

/// Verifies that [`traverse`] builds flattened dependencies and graph edges using [`key`] and existing component versions.
#[test]
fn cross_component_graph_uses_existing_versions_instead_of_new_snapshot_markers() {
    let first = json!({"scope":"scope","name":"first","version":"1.0.0"});
    let second = json!({"scope":"scope","name":"second","version":"2.0.0"});
    let external = json!({"scope":"scope","name":"external","version":"3.0.0"});
    let current = json!({"dependencies":[{"id":second}],"devDependencies":[],"extensions":[]});
    let sibling = json!({"dependencies":[{"id":external}],"devDependencies":[],"extensions":[]});
    let inputs = HashMap::from([(key(&first), current.clone()), (key(&second), sibling)]);
    let saved = HashMap::from([(key(&external), vec![])]);
    let directory = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let mut repository = Repository::new(&directory.0, None);
    let (flattened, graph) =
        traverse(&first, &current, &inputs, &saved, &mut repository, &HashMap::new()).unwrap();
    assert_eq!(flattened, vec![second.clone(), external.clone()]);
    assert_eq!(graph[0], json!({"source":first,"target":second,"type":"prod"}));
    assert_eq!(graph[1], json!({"source":second,"target":external,"type":"prod"}));
    assert!(!directory.0.join(".bit/objects").exists());
}

/// Verifies that [`traverse`] returns empty flattened dependency and graph lists in [`Repository`] for an isolated component [`key`] without dependencies.
#[test]
fn isolated_component_without_dependencies_produces_empty_flattened_list_and_graph() {
    let first = json!({"scope":"scope","name":"first","version":"1.0.0"});
    let current = json!({"dependencies":[],"devDependencies":[],"extensions":[]});
    let inputs = HashMap::from([(key(&first), current.clone())]);
    let directory = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let mut repository = Repository::new(&directory.0, None);
    let (flattened, graph) =
        traverse(&first, &current, &inputs, &HashMap::new(), &mut repository, &HashMap::new())
            .unwrap();
    assert!(flattened.is_empty());
    assert!(graph.is_empty());
}

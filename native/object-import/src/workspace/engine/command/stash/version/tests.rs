//! Unit tests for detached stash `Version` [`Allocation`] and [`Component`] object [`prepare`] and log retention.
//!
//! Verifies that detached stash versions in [`snapshots`] preserve [`Component`] and [`Allocation`] consumer log metadata, builder data, and graph edges via [`prepare`].

use super::{Allocation, Component, prepare, snapshots};
use serde_json::json;

/// Verifies that [`prepare`] preserves consumer log metadata, builder extension data, and flattened edges on detached stash versions.
#[test]
fn detached_version_preserves_consumer_log_builder_and_old_graph_identity() {
    let component = Component {
        identity: "scope/foo".into(),
        id: json!({"scope":"scope","name":"foo"}),
        files: vec![],
        previous: Some("1111111111111111111111111111111111111111".into()),
        bitmap_entry: json!({}),
        new: false,
        version: json!({"schema":"2.0.0","mainFile":"foo.js","bindingPrefix":"@scope",
            "log":{"message":"original","date":"123","username":"author"},
            "buildStatus":"succeed","extensions":[{"name":"teambit.pipelines/builder","config":{},"data":{"retained":true}}],
            "dependencies":[],"devDependencies":[],"flattenedDependencies":[],
            "flattenedEdges":[{"source":{"scope":"scope","name":"foo","version":"1.0.0"},"target":{"scope":"scope","name":"dep","version":"2.0.0"},"type":"prod"}],
            "origin":{"id":{"scope":"old","name":"origin"}},"batchId":"oldbatch","hidden":true}),
    };
    let allocation = Allocation {
        identity: component.identity.clone(),
        hash: "2222222222222222222222222222222222222222".into(),
        log: None,
    };
    let mut objects = vec![];
    let version =
        prepare(&component, &allocation, "2.2.94", &snapshots::State::default(), &mut objects)
            .unwrap();
    assert_eq!(version["parents"], json!([component.previous.unwrap()]));
    assert_eq!(version["log"]["message"], "original");
    assert_eq!(version["buildStatus"], "succeed");
    assert_eq!(version["extensions"][0]["data"]["retained"], true);
    assert!(version.get("origin").is_none());
    assert!(version.get("batchId").is_none());
    assert!(version.get("hidden").is_none());
    assert_eq!(objects.len(), 1);
    assert_eq!(objects[0]["type"], "Version");
}

/// Verifies that [`prepare`] declines when an [`Allocation`] log attempts to override a preserved consumer log.
#[test]
fn a_preserved_consumer_log_cannot_be_overridden_by_allocation() {
    let component = Component {
        identity: "scope/foo".into(),
        id: json!({}),
        version: json!({"log":{"date":"1"}}),
        files: vec![],
        previous: None,
        bitmap_entry: json!({}),
        new: true,
    };
    let allocation = Allocation {
        identity: component.identity.clone(),
        hash: "2222222222222222222222222222222222222222".into(),
        log: Some(json!({"date":"2"})),
    };
    assert!(
        prepare(&component, &allocation, "2.2.94", &snapshots::State::default(), &mut vec![])
            .is_err(),
    );
}

/// Verifies that [`prepare`] uses the [`Allocation`] log and empty `parents` when a new [`Component`] has no consumer log.
#[test]
fn new_component_without_consumer_log_uses_allocation_log_and_empty_parents() {
    let component = Component {
        identity: "scope/foo".into(),
        id: json!({"scope":"scope","name":"foo"}),
        version: json!({"schema":"2.0.0","mainFile":"foo.js","bindingPrefix":"@scope","extensions":[],"dependencies":[],"devDependencies":[],"flattenedDependencies":[],"flattenedEdges":[]}),
        files: vec![],
        previous: None,
        bitmap_entry: json!({}),
        new: true,
    };
    let allocation = Allocation {
        identity: component.identity.clone(),
        hash: "2222222222222222222222222222222222222222".into(),
        log: Some(json!({"message":"stashed","date":"2"})),
    };
    let mut objects = vec![];
    let version =
        prepare(&component, &allocation, "2.2.94", &snapshots::State::default(), &mut objects)
            .unwrap();
    assert_eq!(version["parents"], json!([]));
    assert_eq!(version["log"]["message"], "stashed");
    assert_eq!(objects.len(), 1);
}

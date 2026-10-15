use super::{Repository, external};
use crate::workspace::engine::command::scratch;
use serde_json::json;
use std::collections::{HashMap, HashSet};

#[test]
fn external_adjacency_is_complete_and_absent_models_remain_proven() {
    let directory = scratch::Directory::create().unwrap();
    let mut repository = Repository::new(&directory.0, None);
    let external_id = "external.scope/aspect@1.0.0";
    let workspace_id = "scope/component@current";
    let edge = json!({"source":{"scope":"external.scope","name":"aspect","version":"1.0.0"},
        "target":{"scope":"scope","name":"component","version":"current"},"type":"prod"});
    let saved = HashMap::from([(external_id.to_owned(), vec![edge])]);
    let workspace = HashSet::from([workspace_id.to_owned()]);
    let output =
        external(vec![external_id.to_owned()], &workspace, &saved, &mut repository).unwrap();
    assert_eq!(
        output,
        json!({"external":[{"identity":external_id,"dependencies":[workspace_id],"model":null}]}),
    );
    repository.validate().unwrap();
    let hash = crate::workspace::engine::hash(b"external.scope/aspect");
    let path = directory.0
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, b"new model after planning").unwrap();
    assert!(repository.validate().is_err());
}

#[test]
fn unproven_external_adjacency_and_corrupt_model_never_become_leaf_receipts() {
    let directory = scratch::Directory::create().unwrap();
    let mut repository = Repository::new(&directory.0, None);
    let id = "external.scope/aspect@1.0.0".to_owned();
    assert!(external(vec![id.clone()], &HashSet::new(), &HashMap::new(), &mut repository).is_err());
    let hash = crate::workspace::engine::hash(b"external.scope/aspect");
    let path = directory.0
        .join(".bit/objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, b"corrupt existing model").unwrap();
    let mut repository = Repository::new(&directory.0, None);
    let saved = HashMap::from([(id.clone(), Vec::new())]);
    assert!(external(vec![id], &HashSet::new(), &saved, &mut repository).is_err());
}

use super::{Captured, Input, Repository, checkout_transition, prepare, snapshots};
use serde_json::json;
use std::path::Path;

#[test]
fn retained_metadata_follows_applied_body_indices_without_copying_sources() {
    let plan = json!({"bodies":[
        {"spoolPath":"/private/old","bytes":3,"spoolHash":"old"},
        {"spoolPath":"/private/new","bytes":8,"spoolHash":"new","spoolOffset":12},
    ]});
    let mut applied = json!({"files":[{"relativePath":"index.js","planIndex":1}]});
    let rows = super::retained_files(&plan, &applied).unwrap();
    assert_eq!(rows, vec![json!({"relativePath":"index.js","source":plan["bodies"][1]})]);
    applied["files"][0]["planIndex"] = json!(2);
    assert!(super::retained_files(&plan, &applied).is_err());
}

#[test]
fn imported_harmony_manifests_share_layout_and_preserve_source_references() {
    let mut version = json!({"schema":"1.0.0","mainFile":"index.js","log":{"message":"initial","date":"1"},"files":[{"relativePath":"index.js","name":"index.js","test":false,"file":"a".repeat(40)}]});
    let before = version.clone();
    let first = super::manifest(&"b".repeat(40), &version).unwrap();
    assert_eq!(version, before);
    version["schema"] = json!("2.0.0");
    assert_eq!(super::manifest(&"b".repeat(40), &version).unwrap(), first);
    version["flattenedDependencies"] =
        json!(["scope/dep@1.0.0", {"scope":"scope","name":"dep","version":"1.0.0"}]);
    assert!(super::manifest(&"b".repeat(40), &version).is_err());
    version
        .as_object_mut()
        .unwrap()
        .remove("flattenedDependencies");
    version["schema"] = json!("0.0.0");
    assert!(super::manifest(&"b".repeat(40), &version).is_err());
}

#[test]
fn empty_checkout_target_declines_before_reading_or_materializing_sources() {
    let root = Path::new("/unused-empty-command-root");
    let repository = Repository::new(root, None);
    let captured = Captured {
        added: false,
        hidden: false,
        model_backed: false,
        target: serde_json::from_value(json!({"identity":"scope/alpha","version":"1.0.0",
            "directory":"alpha","files":["index.js"],"current":{"mainFile":"index.js"}}))
        .unwrap(),
        metadata: json!([]),
        files: json!([]),
    };
    let options = serde_json::from_value(json!({"skipDependencyInstallation":true})).unwrap();
    let version = json!({"schema":"2.0.0","files":[]});
    let selection = json!({"version":"1.1.0"});
    let input = Input {
        root,
        directory: root,
        current: &captured,
        version: &version,
        reference: "0000000000000000000000000000000000000000",
        selection: &selection,
        base: None,
        options: &options,
    };
    let error = prepare(
        &input,
        &repository,
        &mut checkout_transition::State::default(),
        &snapshots::State::default(),
    )
    .err()
    .unwrap();
    assert_eq!(error.to_string(), "command checkout target has no files");
}

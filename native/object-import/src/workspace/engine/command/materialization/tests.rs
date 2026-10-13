use super::{Captured, Input, Repository, checkout_transition, prepare, snapshots};
use serde_json::json;
use std::path::Path;

#[test]
fn empty_checkout_target_declines_before_reading_or_materializing_sources() {
    let root = Path::new("/unused-empty-command-root");
    let repository = Repository::new(root, None);
    let captured = Captured {
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

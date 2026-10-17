//! Resolved per-component merge configuration participates in the native continuation.
use super::{compare, pending};
use crate::helper::config;
use std::fs;

#[test]
fn resolved_configuration_is_snapshotted_and_conflict_document_is_consumed() {
    let helper = pending();
    helper.output_file("bar/foo.js", "module.exports = 'resolved';");
    let identity = format!("{}/bar/foo", helper.scopes.remote);
    helper.output_file(
        "merge-conflict",
        &format!(
            "[*] {identity}\n{}",
            serde_json::json!({"teambit.pkg/pkg":{"packageJson":{"mergeResolved":true}}}),
        ),
    );
    let oracle = helper.clone_workspace();
    compare(&helper, &oracle, "merge bar/foo --resolve -m configuration -x");
    let mut actual = super::super::snapshot_environments::version(&helper.scopes.local_path);
    let mut expected = super::super::snapshot_environments::version(&oracle);
    for value in [&mut actual, &mut expected] {
        for entry in value["modified"].as_array_mut().unwrap() {
            entry
                .as_object_mut()
                .unwrap()
                .remove("date");
        }
    }
    assert_eq!(actual, expected);
    assert!(!helper.scopes.local_path.join("merge-conflict").exists());
    assert!(!oracle.join("merge-conflict").exists());
    let actual = config::read_jsonc(&helper.scopes.local_path.join("bar/component.json"));
    let expected = config::read_jsonc(&oracle.join("bar/component.json"));
    assert_eq!(actual["extensions"], expected["extensions"]);
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(oracle.join("bar/foo.js")).unwrap(),
    );
}

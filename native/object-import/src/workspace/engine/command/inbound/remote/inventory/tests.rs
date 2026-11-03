//! Unit tests for remote file inventory metadata ([`file_component`], [`file_inventory_preserves_removed_deprecated_and_readme_metadata`]) and latest tag selection ([`latest_from_model`]) in `bit-object-import`.
//!
//! Verifies removed/deprecated flags, lane readme references, and orphaned tag fallback behavior via [`file_component`], [`latest_from_model`], and [`latest_version_prefers_last_matching_tag_then_orphaned_tag`].

use super::{file_component, latest_from_model};
use serde_json::json;

/// Verifies that [`file_component`] preserves removed, deprecated, and lane readme metadata when `include_removed` is true.
#[test]
fn file_inventory_preserves_removed_deprecated_and_readme_metadata() {
    let head = "a".repeat(40);
    let model = json!({"head":head,"versions":{"1.0.0":head},"deprecated":false});
    let version = json!({"extensions":[
        {"name":"teambit.component/remove","config":{"removed":true}},
        {"name":"teambit.component/deprecation","config":{"deprecate":true}},
        {"name":"teambit.lanes/lanes","config":{"readme":{"scope/dev":true}}}
    ]});
    assert!(file_component("scope", "old", &model, &version, false).unwrap().is_none());
    assert_eq!(
        file_component("scope", "old", &model, &version, true).unwrap(),
        Some(json!({
            "id":"scope/old@1.0.0","deprecated":true,"removed":true,
            "laneReadmeOf":["scope/dev"]
        })),
    );
}

/// Verifies that [`latest_from_model`] selects the last matching active tag before falling back to `orphanedVersions`.
#[test]
fn latest_version_prefers_last_matching_tag_then_orphaned_tag() {
    let head = "b".repeat(40);
    let model = json!({"head":head,"versions":{"1.0.0":head,"1.1.0":head},
        "orphanedVersions":{"0.9.0":head}});
    assert_eq!(latest_from_model(&model).unwrap(), "1.1.0");
    let orphaned = json!({"head":head,"versions":{},"orphanedVersions":{"0.9.0":head}});
    assert_eq!(latest_from_model(&orphaned).unwrap(), "0.9.0");
}

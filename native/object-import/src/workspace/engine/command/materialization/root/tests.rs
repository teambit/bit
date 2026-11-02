//! Unit tests for workspace root component [`ASPECT`] file manifest [`filter`] and [`validate_version`] checks ([`root_manifest_keeps_only_files_owned_by_the_root`], [`only_marked_versions_can_land_at_the_workspace_root`]).
//!
//! Ensures root manifests exclude nested member component directories via [`filter`] and require `isRoot: true` via [`validate_version`] in `bit-object-import`.

use super::{ASPECT, filter, validate_version};
use serde_json::json;

/// Verifies that [`filter`] strips `.bitmap` and nested member component paths while retaining root-owned manifest files.
#[test]
fn root_manifest_keeps_only_files_owned_by_the_root() {
    let mut manifest = json!({"files":[
        {"relativePath":"README.md"}, {"relativePath":".bitmap"},
        {"relativePath":"packages/member"},
        {"relativePath":"packages/member/index.ts"},
        {"relativePath":"packages/member-extra/index.ts"}
    ]});
    filter(&mut manifest, &["packages/member".into()]).unwrap();
    assert_eq!(
        manifest["files"],
        json!([
            {"relativePath":"README.md"},
            {"relativePath":"packages/member-extra/index.ts"},
        ]),
    );
}

/// Verifies that [`validate_version`] requires [`ASPECT`] with `isRoot: true` before materializing at the workspace root.
#[test]
fn only_marked_versions_can_land_at_the_workspace_root() {
    assert!(validate_version(&json!({"extensions":[]})).is_err());
    assert!(
        validate_version(&json!({"extensions":[{"name":ASPECT,"data":{"isRoot":false}}]})).is_err(),
    );
    validate_version(&json!({"extensions":[{"name":ASPECT,"data":{"isRoot":true}}]})).unwrap();
}

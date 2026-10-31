use super::{ASPECT, filter, validate_version};
use serde_json::json;

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

#[test]
fn only_marked_versions_can_land_at_the_workspace_root() {
    assert!(validate_version(&json!({"extensions":[]})).is_err());
    assert!(
        validate_version(&json!({"extensions":[{"name":ASPECT,"data":{"isRoot":false}}]})).is_err(),
    );
    validate_version(&json!({"extensions":[{"name":ASPECT,"data":{"isRoot":true}}]})).unwrap();
}

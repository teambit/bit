use super::{Id, entries, resolve_local};
use serde_json::json;

#[test]
fn alias_resolution_prefers_tracking_and_rejects_ambiguous_names() {
    let scope = json!({"name":"local.scope","lanes":{"tracking":[{"localLane":"dev","remoteLane":"feature","remoteScope":"remote.scope"}]}});
    let index = json!({"lanes":[{"id":{"scope":"other.scope","name":"dev"}}]});
    assert_eq!(
        resolve_local("dev", &scope, &index).unwrap(),
        Id { scope: "remote.scope".into(), name: "feature".into() },
    );
    assert!(resolve_local("missing", &scope, &index).is_err());
    let ambiguous = json!({"lanes":[{"id":{"scope":"a.scope","name":"dev"}},{"id":{"scope":"b.scope","name":"dev"}}]});
    assert!(resolve_local("dev", &json!({}), &ambiguous).is_err());
}

#[test]
fn stored_hidden_ids_keep_version_and_decline_overlapping_buckets() {
    let visible = "1".repeat(40);
    let hidden = "2".repeat(40);
    let value = json!({"components":[{"id":{"scope":"test.scope","name":"alpha"},"head":visible}],
        "updateDependents":[format!("test.scope/beta@{hidden}")]});
    let entries = entries(&value).unwrap();
    assert_eq!(entries.len(), 2);
    assert_eq!(entries[0].identity, "test.scope/alpha");
    assert_eq!(entries[0].head, visible);
    assert!(!entries[0].hidden);
    assert_eq!(entries[1].head, hidden);
    assert!(entries[1].hidden);
    let mut overlap = value;
    overlap["updateDependents"] = json!([format!("test.scope/alpha@{hidden}")]);
    assert!(super::entries(&overlap).is_err());
    assert!(
        super::entries(&json!({"components":[],"updateDependents":["test.scope/beta@latest"]}))
            .is_err(),
    );
}

#[test]
fn lane_path_segments_are_validated_before_remote_lookup() {
    for name in ["../escape", ".", "..", "/absolute", r"a\b", ""] {
        assert!(Id { scope: "test.scope".into(), name: name.into() }.validate().is_err());
    }
    assert!(Id { scope: "test.scope".into(), name: "feature-42".into() }.validate().is_ok());
}

#[test]
fn duplicate_visible_components_are_rejected_before_import() {
    let row = json!({"id":{"scope":"test.scope","name":"alpha"},"head":"1".repeat(40)});
    assert!(entries(&json!({"components":[row,row]})).is_err());
}

#[test]
fn public_alias_lookup_matches_the_authoritative_owner_and_retains_scope_preimages() {
    let root = tempfile::tempdir().unwrap();
    let directory = root.path().join(".bit");
    std::fs::create_dir_all(directory.join("objects")).unwrap();
    let scope = json!({"name":"local.scope","lanes":{"tracking":[
        {"localLane":"local-dev","remoteLane":"dev","remoteScope":"remote.scope"}
    ]}});
    std::fs::write(directory.join("scope.json"), scope.to_string()).unwrap();
    std::fs::write(directory.join("index.json"), r#"{"components":[],"lanes":[]}"#).unwrap();
    assert_eq!(super::resolve_lane_identity(root.path(), "local-dev").unwrap(), "remote.scope/dev");
    let mut plan =
        super::super::prepare_lane(root.path(), &root.path().join("global.json")).unwrap();
    assert_eq!(
        plan.resolve_lane("local-dev").unwrap(),
        Id { scope: "remote.scope".into(), name: "dev".into() },
    );
    let mut changed = scope;
    changed["lanes"]["tracking"][0]["remoteScope"] = json!("changed.scope");
    std::fs::write(directory.join("scope.json"), changed.to_string()).unwrap();
    assert!(plan.validate().is_err());
}

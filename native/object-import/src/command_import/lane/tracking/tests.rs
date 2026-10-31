use super::{Id, append};
use serde_json::json;

#[test]
fn first_remote_switch_appends_alias_but_existing_remote_alias_is_preserved() {
    let id = Id { scope: "remote.scope".into(), name: "dev".into() };
    let mut scope = json!({"lanes":{"tracking":[]}});
    assert!(append(&mut scope, &id, "local-dev").unwrap());
    assert_eq!(
        scope["lanes"]["tracking"],
        json!([
            {"localLane":"local-dev","remoteLane":"dev","remoteScope":"remote.scope"}
        ]),
    );
    assert!(!append(&mut scope, &id, "ignored-new-alias").unwrap());
    assert_eq!(scope["lanes"]["tracking"][0]["localLane"], "local-dev");
}
#[test]
fn alias_collision_updates_the_existing_row_without_reordering_other_tracking() {
    let id = Id { scope: "remote.scope".into(), name: "dev".into() };
    let mut scope = json!({"lanes":{"tracking":[
        {"localLane":"chosen","remoteLane":"old","remoteScope":"old.scope"},
        {"localLane":"other","remoteLane":"other","remoteScope":"other.scope"}
    ]}});
    assert!(append(&mut scope, &id, "chosen").unwrap());
    assert_eq!(
        scope["lanes"]["tracking"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(scope["lanes"]["tracking"][0]["remoteLane"], "dev");
    assert_eq!(scope["lanes"]["tracking"][1]["localLane"], "other");
}

#[test]
fn deferred_alias_requires_its_exact_scope_preimage_before_publication() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("scope.json");
    std::fs::write(&path, b"original").unwrap();
    let tracking = super::SwitchTracking {
        path: path.clone(),
        before: b"original".to_vec(),
        after: b"tracked".to_vec(),
    };
    tracking.validate().unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), b"original");
    std::fs::write(&path, b"provider change").unwrap();
    assert!(tracking.commit().is_err());
    assert_eq!(std::fs::read(&path).unwrap(), b"provider change");
}

#[test]
fn deferred_alias_is_not_written_by_the_earlier_object_import() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let scope_path = root.join(".bit/scope.json");
    std::fs::create_dir_all(root.join(".bit/objects")).unwrap();
    let original = json!({"name":"local.scope","lanes":{"tracking":[]}}).to_string();
    std::fs::write(&scope_path, original.as_bytes()).unwrap();
    std::fs::write(root.join(".bit/index.json"), r#"{"components":[],"lanes":[]}"#).unwrap();
    let mut imported =
        crate::command_import::prepare_lane(root, &root.join("global.json")).unwrap();
    imported
        .stage_switch_tracking_alias(
            &Id { scope: "remote.scope".into(), name: "dev".into() },
            Some("chosen"),
        )
        .unwrap();
    let tracking = imported
        .defer_switch_tracking()
        .unwrap()
        .unwrap();
    imported.commit().unwrap();
    assert_eq!(std::fs::read(&scope_path).unwrap(), original.as_bytes());
    let receipt = tracking.commit().unwrap();
    let scope: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&scope_path).unwrap()).unwrap();
    assert_eq!(scope["lanes"]["tracking"][0]["localLane"], "chosen");
    assert_ne!(receipt["beforeHash"], receipt["afterHash"]);
}

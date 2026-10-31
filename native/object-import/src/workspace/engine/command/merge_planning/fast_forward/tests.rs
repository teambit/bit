use super::{model, selection};
use serde_json::json;

#[test]
fn fast_forward_stages_only_model_and_defers_publication() {
    use std::{fs, io::Read};
    let root = super::scratch::Directory::create().unwrap();
    let staging = super::scratch::Directory::create().unwrap();
    fs::create_dir_all(root.0.join(".bit/objects")).unwrap();
    fs::write(root.0.join(".bit/index.json"), b"unchanged index").unwrap();
    let head = "d".repeat(40);
    let original = json!({"name":"alpha","scope":"scope","versions":{"1.0.0":"a".repeat(40)},
        "lang":"javascript","deprecated":false,"bindingPrefix":"@scope","remotes":[],
        "schema":"2.0.0","head":"a".repeat(40),"state":{}});
    let updated = model(&original, &head).unwrap();
    let mut plan = super::merge::snapshot::prepare_models(&staging.0, vec![updated]).unwrap();
    assert_eq!(fs::read_dir(root.0.join(".bit/objects")).unwrap().count(), 0);
    plan.validate().unwrap();
    plan.commit(&root.0).unwrap();
    let hash = crate::workspace::engine::hash(b"scope/alpha");
    let bytes = fs::read(
        root.0
            .join(".bit/objects")
            .join(&hash[..2])
            .join(&hash[2..]),
    )
    .unwrap();
    let mut body = Vec::new();
    flate2::read::ZlibDecoder::new(bytes.as_slice()).read_to_end(&mut body).unwrap();
    let offset = body
        .iter()
        .position(|byte| *byte == 0)
        .unwrap();
    let value: serde_json::Value = serde_json::from_slice(&body[offset + 1..]).unwrap();
    assert_eq!(value["head"], head);
    assert_eq!(value["state"], json!({"versions":{head:{"local":true}}}));
    assert_eq!(value["versions"], original["versions"]);
    assert_eq!(fs::read(root.0.join(".bit/index.json")).unwrap(), b"unchanged index");
    assert!(!root.0.join(".bit/staged-snaps.json").exists());
}

#[test]
fn fast_forward_marks_hash_and_preserves_existing_local_metadata_and_tags() {
    let head = "b".repeat(40);
    let original = json!({"head":"a".repeat(40),"versions":{"2.0.0":head},
        "state":{"custom":true,"versions":{head.clone():{"local":false,"extra":"keep"}}}});
    let updated = model(&original, &head).unwrap();
    assert_eq!(updated["head"], head);
    assert_eq!(updated["versions"], original["versions"]);
    assert_eq!(updated["state"]["custom"], true);
    assert_eq!(updated["state"]["versions"][&head], json!({"local":true,"extra":"keep"}));
    assert_eq!(original["state"]["versions"][&head]["local"], false);
    assert_eq!(selection::versions::label(&updated, &head), "2.0.0");
}

#[test]
fn fast_forward_replaces_state_without_versions_and_keeps_orphan_tag_precedence() {
    let head = "c".repeat(40);
    let original = json!({"state":{"custom":true},"versions":{},"orphanedVersions":{"1.0.0":head}});
    let updated = model(&original, &head).unwrap();
    assert_eq!(updated["state"], json!({"versions":{head.clone():{"local":true}}}));
    assert_eq!(selection::versions::label(&updated, &head), "1.0.0");
    assert!(model(&original, "invalid").is_err());
}

#[test]
fn gap_import_refreshes_fast_forward_metadata_without_retargeting_cached_head() {
    use super::super::{Action, Selected, loading::refresh_model};
    let old = "a".repeat(40);
    let cached = "b".repeat(40);
    let latest = "c".repeat(40);
    let mut selected = Selected {
        model: json!({"head":old}),
        remote: cached.clone(),
        current_hash: old.clone(),
        current_head: old.clone(),
        distance: serde_json::Value::Null,
        versions: [serde_json::Value::Null, serde_json::Value::Null, serde_json::Value::Null],
        base: old.clone(),
        action: Action::Target,
    };
    refresh_model(&mut selected, json!({"head":latest,"versions":{"3.0.0":latest}})).unwrap();
    assert_eq!(selected.remote, cached);
    assert_eq!(selected.model["head"], latest);
    selected.action = Action::Merge;
    assert!(refresh_model(&mut selected, json!({"head":old})).is_err());
}

use super::Main;
use serde_json::json;
use std::fs;

#[test]
fn main_backups_require_unique_models_and_a_matching_index_before_publication() {
    let root = tempfile::tempdir().unwrap();
    let backup = root.path().join(".bit/last-merged/main-components");
    fs::create_dir_all(&backup).unwrap();
    let value =
        json!({"scope":"fixture.scope","name":"component","versions":{},"head":"a".repeat(40)});
    let (hash, bytes) = super::super::super::super::lane_publication::encode_model(&value).unwrap();
    fs::write(backup.join("0"), &bytes).unwrap();
    let index = root.path().join(".bit/index.json");
    fs::write(&index, b"{\"components\":[]}").unwrap();
    assert!(Main::prepare(root.path(), &mut Vec::new()).is_err());
    fs::write(index, serde_json::to_vec(&json!({"components":[{"hash":hash}]})).unwrap()).unwrap();
    let plan = Main::prepare(root.path(), &mut Vec::new()).unwrap().unwrap();
    assert_eq!(plan.objects, vec![(hash, bytes.clone())]);
    plan.validate().unwrap();
    fs::write(backup.join("1"), bytes).unwrap();
    assert!(plan.validate().is_err());
    assert!(Main::prepare(root.path(), &mut Vec::new()).is_err());
    assert!(
        !root
            .path()
            .join(".bit/objects")
            .exists(),
    );
}

#[test]
fn old_backups_without_main_models_remain_compatible() {
    let root = tempfile::tempdir().unwrap();
    fs::create_dir_all(root.path().join(".bit/last-merged")).unwrap();
    assert!(Main::prepare(root.path(), &mut Vec::new()).unwrap().is_none());
}

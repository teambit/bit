use super::{Engine, MAX_PROOFS};
use serde_json::json;
use std::fs;

#[test]
fn a_stale_receipt_in_the_last_frame_is_still_rejected() {
    let directory = tempfile::tempdir().unwrap();
    let proofs = (0..=MAX_PROOFS)
        .map(|index| json!({"path":directory.path().join(index.to_string()),"hash":null}))
        .collect::<Vec<_>>();
    fs::write(directory.path().join(MAX_PROOFS.to_string()), b"changed").unwrap();
    let error = Engine::new()
        .unwrap()
        .validate_read_set(&proofs, "test stale receipt")
        .unwrap_err();
    assert!(error.to_string().contains("dependency capture changed"), "{error}");
}

#[test]
fn different_observations_of_one_path_are_not_deduplicated() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("absent");
    let proofs = [json!({"path":path,"hash":null}), json!({"path":path,"hash":"0".repeat(64)})];
    let error = Engine::new()
        .unwrap()
        .validate_read_set(&proofs, "test stale receipt")
        .unwrap_err();
    assert!(error.to_string().contains("dependency capture changed"), "{error}");
}

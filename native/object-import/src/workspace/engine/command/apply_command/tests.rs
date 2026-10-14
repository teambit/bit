use super::notify;
use crate::workspace::engine::command::scratch;
use std::fs;

#[test]
fn persistence_notification_counts_actual_invocations_and_preserves_empty_payload() {
    let directory = scratch::Directory::create().unwrap();
    let event = directory.0.join(".bit/events/onPostObjectsPersist");
    assert_eq!(notify(&directory.0), 1);
    assert_eq!(fs::read(&event).unwrap(), b"");
    fs::write(&event, b"stale").unwrap();
    assert_eq!(notify(&directory.0), 1);
    assert_eq!(fs::read(&event).unwrap(), b"");
}

#[test]
fn persistence_notification_failure_remains_best_effort_but_records_invocation() {
    let directory = scratch::Directory::create().unwrap();
    fs::write(directory.0.join(".bit"), b"not a directory").unwrap();
    assert_eq!(notify(&directory.0), 1);
    assert_eq!(fs::read(directory.0.join(".bit")).unwrap(), b"not a directory");
}

#[test]
fn changed_final_dependency_proof_is_rejected_before_command_publication() {
    let directory = scratch::Directory::create().unwrap();
    let source = directory.0.join("index.js");
    fs::write(&source, b"module.exports = 1").unwrap();
    let mut proofs = Vec::new();
    super::proof::read(&source, &mut proofs).unwrap();
    let request = super::Apply {
        token: "unused".to_owned(),
        file_id: "2026-10-14-12-00-00".to_owned(),
        dependency_read_set: proofs,
    };
    fs::write(&source, b"module.exports = 2").unwrap();
    let error = super::run(&request, &mut super::State::default()).unwrap_err();
    assert_eq!(error.to_string(), "dependency capture changed");
    assert!(!directory.0.join(".bit").exists());
    assert_eq!(fs::read(&source).unwrap(), b"module.exports = 2");
    let omitted: super::Apply = serde_json::from_value(serde_json::json!({
        "token":"unused", "fileId":"2026-10-14-12-00-00",
    }))
    .unwrap();
    assert!(omitted.dependency_read_set.is_empty());
}

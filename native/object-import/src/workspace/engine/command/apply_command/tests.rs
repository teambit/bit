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

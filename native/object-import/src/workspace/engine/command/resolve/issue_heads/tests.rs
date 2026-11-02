//! Unit tests for issue head version [`capture`] and [`Repository`] absence proofs in `bit-object-import`.
//!
//! Ensures missing issue head objects are proven absent via [`capture`] and [`Repository`] while corrupt existing objects fail closed on validation.

use super::{Repository, capture};
use serde_json::json;

/// Verifies that [`capture`] records [`Repository`] absence proofs for missing issue heads and rejects corrupt existing loose objects.
#[test]
fn missing_issue_head_is_proven_and_corrupt_existing_head_is_not_absence() {
    let root = crate::workspace::engine::command::scratch::Directory::create().unwrap();
    let head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let context = json!({"models":[{"scope":"scope","name":"component","head":head}]});
    let mut repository = Repository::new(&root.0, None);
    let result = capture(&context, &mut repository).unwrap();
    assert!(result[0]["heads"][0]["version"].is_null());
    repository.validate().unwrap();
    let path = root.0
        .join(".bit/objects")
        .join(&head[..2])
        .join(&head[2..]);
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, b"changed object").unwrap();
    assert!(repository.validate().is_err());
    assert!(capture(&context, &mut Repository::new(&root.0, None)).is_err());
}

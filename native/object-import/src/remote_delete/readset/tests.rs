//! Unit tests for remote delete [`Readset`] file watch, stat snapshots, and concurrent mutation validation ([`watched_source_rejects_later_mutation_and_missing_source_rejects_creation`]) in `bit-object-import`.

use super::Readset;
use std::fs;

/// Verifies that [`Readset::validate`] rejects post-watch file modifications and unexpected file creations.
#[test]
fn watched_source_rejects_later_mutation_and_missing_source_rejects_creation() {
    let root = tempfile::tempdir().unwrap();
    let mut readset = Readset::new(root.path());
    let existing = root.path().join("objects/source");
    let missing = root.path().join("objects/missing");
    fs::create_dir_all(existing.parent().unwrap()).unwrap();
    fs::write(&existing, b"before").unwrap();
    readset.watch(&existing).unwrap();
    readset.watch(&missing).unwrap();
    assert!(readset.validate().is_ok());
    fs::write(&existing, b"after").unwrap();
    assert!(readset.validate().is_err());
    fs::write(&existing, b"before").unwrap();
    fs::write(&missing, b"created").unwrap();
    assert!(readset.validate().is_err());
}

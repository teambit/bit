use super::Readset;
use std::fs;

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

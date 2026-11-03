//! Unit tests for [`ObjectChange`] deletion, [`object_path`], and empty prefix directory pruning via [`write_objects`] ([`deleting_the_only_object_prunes_its_prefix_but_keeps_the_object_store`], [`deleting_an_object_keeps_its_shared_prefix_and_neighbor_bytes`]) in `bit-object-import`.

use crate::reset_lane::{ObjectChange, object_path, write_objects};
use std::fs;

/// Verifies that [`write_objects`] prunes the two-character prefix directory when deleting its last [`ObjectChange`] while keeping `.bit/objects`.
#[test]
fn deleting_the_only_object_prunes_its_prefix_but_keeps_the_object_store() {
    let fixture = tempfile::tempdir().expect("fixture");
    let objects = fixture.path().join(".bit/objects");
    let hash = "a".repeat(40);
    let path = object_path(&objects, &hash);
    fs::create_dir_all(path.parent().expect("prefix")).expect("prefix");
    fs::write(&path, b"component").expect("object");
    write_objects(
        fixture.path(),
        &[ObjectChange { hash, before: b"component".to_vec(), after: None }],
    )
    .expect("delete");
    assert!(!path.exists());
    assert!(!path.parent().expect("prefix").exists());
    assert!(objects.is_dir());
}

/// Verifies that [`write_objects`] retains a shared two-character prefix directory and sibling objects when deleting one object.
#[test]
fn deleting_an_object_keeps_its_shared_prefix_and_neighbor_bytes() {
    let fixture = tempfile::tempdir().expect("fixture");
    let objects = fixture.path().join(".bit/objects");
    let hash = "a".repeat(40);
    let path = object_path(&objects, &hash);
    let neighbor = object_path(&objects, &format!("aa{}", "b".repeat(38)));
    fs::create_dir_all(path.parent().expect("prefix")).expect("prefix");
    fs::write(&path, b"component").expect("object");
    fs::write(&neighbor, b"retained immutable object").expect("neighbor");
    write_objects(
        fixture.path(),
        &[ObjectChange { hash, before: b"component".to_vec(), after: None }],
    )
    .expect("delete");
    assert!(!path.exists());
    assert!(path.parent().expect("prefix").is_dir());
    assert_eq!(fs::read(neighbor).expect("neighbor"), b"retained immutable object");
}

/// Verifies that [`write_objects`] leaves an existing empty prefix directory untouched when deleting an already-missing [`ObjectChange`] ([`object_path`]).
#[test]
fn an_already_missing_object_does_not_prune_its_existing_empty_prefix() {
    let fixture = tempfile::tempdir().expect("fixture");
    let objects = fixture.path().join(".bit/objects");
    let hash = "a".repeat(40);
    let path = object_path(&objects, &hash);
    fs::create_dir_all(path.parent().expect("prefix")).expect("prefix");
    write_objects(fixture.path(), &[ObjectChange { hash, before: Vec::new(), after: None }])
        .expect("missing delete");
    assert!(path.parent().expect("prefix").is_dir());
}

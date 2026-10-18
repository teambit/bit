use super::{Retained, json};
use std::fs;

fn write(path: &std::path::Path, before: &[u8], after: &[u8]) -> serde_json::Value {
    let original = bit_install::policy::scope::proof_from_bytes(path, Some(before));
    let published = bit_install::policy::scope::proof_from_bytes(path, Some(after));
    json!({"path":path,"beforeHash":original["hash"],"afterHash":published["hash"]})
}
#[test]
fn exact_owned_content_advances_without_discarding_other_receipts() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("source.js");
    fs::write(&path, b"new").unwrap();
    let before = bit_install::policy::scope::proof_from_bytes(&path, Some(b"old"));
    let unrelated = json!({"path":directory.path().join("other.js"),"hash":null});
    let metadata = json!({"path":path,"hash":null,"metadata":{"kind":"file","realPath":path}});
    let mut retained = Retained {
        read_set: vec![before, unrelated.clone(), metadata.clone()],
        ..Default::default()
    };
    retained
        .acknowledge_import(&[write(&path, b"old", b"new")])
        .unwrap();
    assert_eq!(
        retained.read_set,
        vec![
            bit_install::policy::scope::proof_from_bytes(&path, Some(b"new")),
            unrelated,
            metadata,
        ],
    );
}
#[test]
fn a_conflicting_preimage_does_not_partially_advance_an_earlier_receipt() {
    let directory = tempfile::tempdir().unwrap();
    let first = directory.path().join("first.js");
    let second = directory.path().join("second.js");
    fs::write(&first, b"new").unwrap();
    fs::write(&second, b"new").unwrap();
    let mut retained = Retained {
        read_set: vec![
            bit_install::policy::scope::proof_from_bytes(&first, Some(b"old")),
            bit_install::policy::scope::proof_from_bytes(&second, Some(b"unexpected")),
        ],
        ..Default::default()
    };
    let original = retained.read_set.clone();
    assert!(
        retained
            .acknowledge_import(&[write(&first, b"old", b"new"), write(&second, b"old", b"new")])
            .is_err(),
    );
    assert_eq!(retained.read_set, original);
}
#[test]
fn changed_published_bytes_are_rejected_and_absent_receipts_are_not_invented() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("source.js");
    fs::write(&path, b"concurrent").unwrap();
    let before = bit_install::policy::scope::proof_from_bytes(&path, Some(b"old"));
    let mut retained = Retained { read_set: vec![before.clone()], ..Default::default() };
    assert!(
        retained
            .acknowledge_import(&[write(&path, b"old", b"new")])
            .is_err(),
    );
    assert_eq!(retained.read_set, vec![before]);
    let unrelated = directory.path().join("not-captured.js");
    retained
        .acknowledge_import(&[write(&unrelated, b"old", b"new")])
        .unwrap();
    assert_eq!(retained.read_set.len(), 1);
}
#[cfg(unix)]
#[test]
fn a_symlink_cannot_acknowledge_a_regular_publication_even_with_matching_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("source.js");
    let alias = directory.path().join("alias.js");
    fs::write(&alias, b"new").unwrap();
    std::os::unix::fs::symlink(&alias, &path).unwrap();
    let mut retained = Retained {
        read_set: vec![bit_install::policy::scope::proof_from_bytes(&path, Some(b"old"))],
        ..Default::default()
    };
    assert!(
        retained
            .acknowledge_import(&[write(&path, b"old", b"new")])
            .is_err(),
    );
}

#[test]
fn changing_import_versions_invalidates_only_the_reusable_row() {
    let source = json!({"path":"/workspace/source.js","hash":"retained"});
    let row = json!({"identity":"acme/comp","version":"0.0.1"});
    let other = json!({"identity":"acme/other","version":"0.0.1"});
    let mut retained =
        Retained { read_set: vec![source.clone()], started: true, ..Default::default() };
    retained.rows.insert("acme/comp".into(), row.clone());
    retained.rows.insert("acme/other".into(), other.clone());
    retained.import_version("acme/comp", Some("0.0.1"));
    assert_eq!(retained.rows["acme/comp"], row);
    retained.import_version("acme/comp", Some("0.0.2"));
    assert!(!retained.rows.contains_key("acme/comp"));
    assert_eq!(retained.rows["acme/other"], other);
    assert_eq!(retained.read_set, vec![source]);
    assert!(retained.started);
}

#[cfg(windows)]
#[test]
fn windows_separator_equivalence_advances_hashes_without_rewriting_proof_paths() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("source.js");
    fs::write(&path, b"new").unwrap();
    let forward = path
        .to_str()
        .unwrap()
        .replace('\\', "/");
    let mut proof = bit_install::policy::scope::proof_from_bytes(&path, Some(b"old"));
    proof["path"] = json!(forward);
    let mut retained = Retained { read_set: vec![proof], ..Default::default() };
    retained
        .acknowledge_import(&[write(&path, b"old", b"new")])
        .unwrap();
    let mut expected = bit_install::policy::scope::proof_from_bytes(&path, Some(b"new"));
    expected["path"] = json!(forward);
    assert_eq!(retained.read_set, vec![expected]);
    let mut duplicate = write(&path, b"new", b"new");
    duplicate["path"] = json!(forward);
    let before = retained.read_set.clone();
    assert!(
        retained
            .acknowledge_import(&[write(&path, b"new", b"new"), duplicate])
            .is_err(),
    );
    assert_eq!(retained.read_set, before);
}

#[test]
fn malformed_acknowledgments_cannot_advance_a_valid_content_proof() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("source.js");
    fs::write(&path, b"new").unwrap();
    let before = bit_install::policy::scope::proof_from_bytes(&path, Some(b"old"));
    let mut retained = Retained { read_set: vec![before.clone()], ..Default::default() };
    for field in ["beforeHash", "afterHash", "path"] {
        let mut receipt = write(&path, b"old", b"new");
        receipt[field] = json!("invalid");
        assert!(
            retained
                .acknowledge_import(&[receipt])
                .is_err(),
        );
        assert_eq!(retained.read_set, vec![before.clone()]);
    }
    retained
        .acknowledge_import(&[])
        .unwrap();
    assert_eq!(retained.read_set, vec![before]);
}

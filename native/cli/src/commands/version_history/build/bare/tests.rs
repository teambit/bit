use super::{Plan, fs};

#[test]
fn existing_temporary_file_is_not_deleted_after_failed_creation() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("object");
    let temporary = directory
        .path()
        .join(format!(".object.{}.1", std::process::id()));
    fs::write(&temporary, b"other operation").unwrap();
    let plan = Plan {
        path: path.clone(),
        identity: "fixture/component".into(),
        payload: b"data".to_vec(),
        proofs: Vec::new(),
        count: 1,
    };
    assert!(plan.publish().is_err());
    assert_eq!(fs::read(temporary).unwrap(), b"other operation");
    assert!(!path.exists());
}

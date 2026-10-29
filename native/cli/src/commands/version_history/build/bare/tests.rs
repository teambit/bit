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
        mode: None,
    };
    assert!(plan.publish().is_err());
    assert_eq!(fs::read(temporary).unwrap(), b"other operation");
    assert!(!path.exists());
}

#[test]
fn cyclic_ancestry_declines_before_publishing() {
    use flate2::{Compression, write::ZlibEncoder};
    use std::io::Write;
    let directory = tempfile::tempdir().unwrap();
    let hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let body = format!(r#"{{"parents":["{hash}"]}}"#);
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "Version {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body.as_bytes()).unwrap();
    let path = directory
        .path()
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, encoder.finish().unwrap()).unwrap();
    let mut proofs = Vec::new();
    assert!(super::ancestry(directory.path(), hash, &mut proofs).is_none());
    assert_eq!(proofs.len(), 1);
    assert!(path.exists());
}

#[test]
fn all_lanes_requires_an_empty_index_and_records_its_bytes() {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    fs::write(root.join("scope.json"), r#"{"name":"fixture"}"#).unwrap();
    let index = root.join("index.json");
    fs::write(&index, r#"{"lanes":[]}"#).unwrap();
    let proofs = super::metadata_proofs(root, "fixture", true).unwrap();
    assert_eq!(proofs[1].1, fs::read(&index).unwrap());
    fs::write(&index, r#"{"lanes":[{"hash":"fixture"}]}"#).unwrap();
    assert!(super::metadata_proofs(root, "fixture", true).is_none());
    assert!(super::metadata_proofs(root, "fixture", false).is_some());
}

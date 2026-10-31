use super::{objects, single_error};
use crate::component_tracking::observe::Observed;
use bit_client_transfer::tar::ObjectItem;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use sha1::{Digest, Sha1};
use std::{
    fs,
    io::{self, Write},
    path::Path,
};

fn object(root: &Path, kind: &str, hash: &str, body: &[u8]) -> ObjectItem {
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    write!(encoder, "{kind} {hash} {}\0", body.len()).unwrap();
    encoder.write_all(body).unwrap();
    let compressed = encoder.finish().unwrap();
    let path = root
        .join("objects")
        .join(&hash[..2])
        .join(&hash[2..]);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, &compressed).unwrap();
    ObjectItem { hash: hash.into(), compressed, scope: None }
}
fn fixture() -> (tempfile::TempDir, Vec<ObjectItem>) {
    let directory = tempfile::tempdir().unwrap();
    let root = directory.path();
    let source = b"binary\0bytes\r\n";
    let source_hash = crate::validate::hexadecimal(&Sha1::digest(source));
    let version_hash = "2".repeat(40);
    let model_hash = "1".repeat(40);
    let version = json!({"mainFile":"index.js","files":[{"relativePath":"index.js","file":source_hash}],"extensions":[]});
    let model = json!({"scope":"old.scope","name":"source","head":version_hash,"versions":{"0.0.1":version_hash}});
    let items = vec![
        object(root, "Component", &model_hash, &serde_json::to_vec(&model).unwrap()),
        object(root, "Version", &version_hash, &serde_json::to_vec(&version).unwrap()),
        object(root, "Source", &source_hash, source),
    ];
    fs::write(
        root.join("index.json"),
        serde_json::to_vec(
            &json!({"components":[{"id":{"scope":"old.scope","name":"source"},"hash":model_hash}]}),
        )
        .unwrap(),
    )
    .unwrap();
    (directory, items)
}
#[test]
fn file_and_http_capture_preserve_identical_version_and_binary_source_without_publication() {
    let (directory, items) = fixture();
    let from_file =
        objects::file(directory.path(), "old.scope/source", &mut Observed::default()).unwrap();
    let from_http = objects::http(&items, "old.scope/source").unwrap();
    assert_eq!(from_file.0, from_http.0);
    assert_eq!(from_file.1, from_http.1);
    assert_eq!(from_file.2, from_http.2);
    assert_eq!(from_file.1[0].1, b"binary\0bytes\r\n");
    assert!(
        !directory
            .path()
            .join("staged-snaps")
            .exists(),
    );
}
#[test]
fn forged_http_source_identity_and_duplicate_logical_paths_are_rejected() {
    let (directory, mut items) = fixture();
    let hash = items[2].hash.clone();
    items[2] = object(directory.path(), "Source", &hash, b"forged");
    assert!(objects::http(&items, "old.scope/source").is_err());
    let (_, mut items) = fixture();
    let source_hash = items[2].hash.clone();
    let row = json!({"relativePath":"index.js","file":source_hash});
    let version = json!({"mainFile":"index.js","files":[row,row],"extensions":[]});
    let hash = items[1].hash.clone();
    items[1] = object(directory.path(), "Version", &hash, &serde_json::to_vec(&version).unwrap());
    assert!(objects::http(&items, "old.scope/source").is_err());
}
#[test]
fn single_remote_not_found_translation_does_not_hide_permissions_or_budget_failures() {
    for kind in [io::ErrorKind::PermissionDenied, io::ErrorKind::Unsupported] {
        let error = single_error(io::Error::new(kind, "preserved"), "old.scope/source");
        assert_eq!(error.kind(), kind);
        assert_eq!(error.to_string(), "preserved");
    }
    let error =
        single_error(io::Error::other("checkout invalid compressed object"), "old.scope/source");
    assert_eq!(error.to_string(), r#"error: component "old.scope/source" was not found"#);
}

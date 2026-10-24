use super::{heads, object};
use crate::commands::doctor::catalog::DIAGNOSES;
use flate2::{Compression, write::ZlibEncoder};
use serde_json::{Value, json};
use std::{fs, io::Write, path::Path};
fn write_object(scope: &Path, hash: &str, value: &Value) {
    let body = serde_json::to_vec(value).unwrap();
    let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(format!("Component {hash} {}\0", body.len()).as_bytes())
        .unwrap();
    encoder.write_all(&body).unwrap();
    let directory = scope.join("objects").join(&hash[..2]);
    fs::create_dir_all(&directory).unwrap();
    fs::write(directory.join(&hash[2..]), encoder.finish().unwrap()).unwrap();
}
#[test]
fn integrity_inspects_only_local_models_and_reports_the_missing_head() {
    let directory = tempfile::tempdir().unwrap();
    let scope = directory.path();
    fs::write(scope.join("scope.json"), r#"{"name":"local.scope"}"#).unwrap();
    let hash = "0123456789012345678901234567890123456789";
    let head = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    write_object(scope, hash, &json!({"scope":"local.scope","name":"foo/bar","head":head}));
    fs::write(
        scope.join("index.json"),
        serde_json::to_vec(&json!({"components":[
            {"id":{"scope":"local.scope","name":"foo/bar"},"isSymlink":false,"hash":hash},
            {"id":{"scope":"remote.scope","name":"external"},"isSymlink":false,"hash":head},
        ]}))
        .unwrap(),
    )
    .unwrap();
    let result = heads(&DIAGNOSES[7], Some(scope)).unwrap();
    assert_eq!(
        result["bareResult"],
        json!({"valid":false,"data":{"componentsWithMissingHeads":[{"id":"local.scope/foo/bar","head":head}],"totalComponents":1}}),
    );
    assert!(
        result["formattedSymptoms"]
            .as_str()
            .unwrap()
            .contains(head),
    );
}
#[test]
fn invalid_compressed_objects_fail_instead_of_reporting_a_missing_head() {
    let directory = tempfile::tempdir().unwrap();
    let hash = "0123456789012345678901234567890123456789";
    let parent = directory.path().join("objects/01");
    fs::create_dir_all(&parent).unwrap();
    fs::write(parent.join(&hash[2..]), b"invalid zlib stream").unwrap();
    assert!(object(directory.path(), hash).is_err());
}

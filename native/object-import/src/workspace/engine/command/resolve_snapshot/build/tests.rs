use super::artifacts;
use crate::workspace::engine::{command::scratch::Directory, dependency_graph::proof};
use serde_json::{Value, json};
use std::{fs, path::Path};

fn receipt(root: &Path, file: &Path) -> Value {
    json!({"artifactRoot":root,"artifacts":[{"identity":"scope/alpha","artifactIndex":0,"fileIndex":0,"relativePath":"dist/index.js","path":file}],
        "versions":[{"identity":"scope/alpha","buildData":{"extensions":[{"name":"teambit.pipelines/builder","data":{"artifacts":[{"files":[{"relativePath":"dist/index.js","file":"__native_artifact_pending__"}]}]}}]}}]})
}

#[test]
fn artifact_bytes_are_hashed_without_source_normalization_and_retained_as_read_proofs() {
    let directory = Directory::create().unwrap();
    let path = directory.0.join("artifact");
    let bytes = b"\xef\xbb\xbfartifact\r\n\0";
    fs::write(&path, bytes).unwrap();
    let mut value = receipt(&directory.0, &path);
    let (mut objects, mut proofs) = (Vec::new(), Vec::new());
    artifacts(&mut value, &mut objects, &mut proofs).unwrap();
    let hash = "673e08d4400260d18b5a6cc02c55802b3a33a03c";
    assert_eq!(objects[0]["hash"], hash);
    assert_eq!(objects[0]["body"], crate::validate::hexadecimal(bytes));
    assert_eq!(
        value["versions"][0]["buildData"]["extensions"][0]["data"]["artifacts"][0]["files"][0]["file"],
        hash,
    );
    proof::verify(&proofs).unwrap();
    fs::write(path, b"changed").unwrap();
    assert!(proof::verify(&proofs).is_err());
}

#[test]
fn artifacts_must_be_confined_to_the_private_root_and_bound_to_the_declared_file() {
    let directory = Directory::create().unwrap();
    let outside = Directory::create().unwrap();
    let path = outside.0.join("artifact");
    fs::write(&path, b"artifact").unwrap();
    let mut value = receipt(&directory.0, &path);
    assert!(artifacts(&mut value, &mut Vec::new(), &mut Vec::new()).is_err());
    let path = directory.0.join("artifact");
    fs::write(&path, b"artifact").unwrap();
    let mut value = receipt(&directory.0, &path);
    value["artifacts"][0]["relativePath"] = json!("dist/other.js");
    assert!(artifacts(&mut value, &mut Vec::new(), &mut Vec::new()).is_err());
}

#[test]
fn oversized_artifacts_are_rejected_before_reading_their_bytes() {
    let directory = Directory::create().unwrap();
    let path = directory.0.join("artifact");
    fs::File::create(&path)
        .unwrap()
        .set_len(32 * 1024 * 1024 + 1)
        .unwrap();
    let mut value = receipt(&directory.0, &path);
    let (mut objects, mut proofs) = (Vec::new(), Vec::new());
    assert!(artifacts(&mut value, &mut objects, &mut proofs).is_err());
    assert!(objects.is_empty());
    assert!(proofs.is_empty());
}

#[cfg(unix)]
#[test]
fn symlink_artifacts_and_symlink_parents_are_rejected() {
    let directory = Directory::create().unwrap();
    let outside = Directory::create().unwrap();
    let path = outside.0.join("artifact");
    fs::write(&path, b"artifact").unwrap();
    let link = directory.0.join("link");
    std::os::unix::fs::symlink(&path, &link).unwrap();
    let mut value = receipt(&directory.0, &link);
    assert!(artifacts(&mut value, &mut Vec::new(), &mut Vec::new()).is_err());
    let parent = directory.0.join("parent");
    std::os::unix::fs::symlink(&outside.0, &parent).unwrap();
    let mut value = receipt(&directory.0, &parent.join("artifact"));
    assert!(artifacts(&mut value, &mut Vec::new(), &mut Vec::new()).is_err());
}

use super::{State, apply, hash};
use flate2::{Compression, write::ZlibEncoder};
use serde_json::json;
use std::{fs, io::Write};

#[test]
fn diff_uses_captured_workspace_bytes_and_verified_repository_sources() {
    let fixture = super::tests::Fixture::new();
    let directory = fixture.directory("snapshots");
    let objects = fixture.directory("objects");
    let path = fixture.0.join("file");
    fs::write(&path, b"new\r\n").unwrap();
    let mut state = State::default();
    let snapshot=apply("inspectionBegin",json!({"files":[{"relativePath":"index.js","path":path}],"workspaceRoot":false,"snapshotDirectory":directory}),&mut state).unwrap();
    fs::write(path, b"later\n").unwrap();
    let source_hash = hash(b"old\n");
    let mut compressed = ZlibEncoder::new(Vec::new(), Compression::default());
    compressed
        .write_all(format!("Source {source_hash} 4\0old\n").as_bytes())
        .unwrap();
    let store = crate::store::Store::new(objects.clone(), None).unwrap();
    store
        .write(&source_hash, &compressed.finish().unwrap())
        .unwrap();
    let result=apply("inspectionDiff",json!({"token":snapshot["token"],"objectsDirectory":objects,"modelFiles":[{"relativePath":"index.js","hash":source_hash}],"gitExecutable":"git","color":false}),&mut state).unwrap();
    assert_eq!(result["files"][0]["fromContent"], "old\n");
    assert_eq!(result["files"][0]["toContent"], "new\r\n");
    assert_eq!(result["files"][0]["same"], false);
    assert!(
        result["files"][0]["rawDiff"]
            .as_str()
            .unwrap()
            .contains("+new"),
    );
}

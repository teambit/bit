use super::{State, apply, hash};
use serde_json::json;
use std::{
    fs,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
pub(super) struct Fixture(pub(super) std::path::PathBuf);
impl Fixture {
    pub(super) fn new() -> Self {
        let path = std::env::temp_dir()
            .join(format!(
                "bit-inspection-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed),
            ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }
    pub(super) fn directory(&self, name: &str) -> std::path::PathBuf {
        let path = self.0.join(name);
        fs::create_dir(&path).unwrap();
        path
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
#[test]
fn retained_snapshot_survives_file_mutation_and_finish_rejects_old_token() {
    let fixture = Fixture::new();
    let directory = fixture.directory("snapshots");
    let path = fixture.0.join("file");
    fs::write(&path, b"\xef\xbb\xbfhello\r\n").unwrap();
    let mut state = State::default();
    let output=apply("inspectionBegin",json!({"files":[{"relativePath":"index.js","path":path}],"workspaceRoot":false,"snapshotDirectory":directory}),&mut state).unwrap();
    let row = &output["files"][0];
    assert_eq!(row["linuxHash"], hash(b"hello\n"));
    assert_eq!(row["snapshotHash"], hash(b"hello\r\n"));
    assert_eq!(fs::read(row["snapshotPath"].as_str().unwrap()).unwrap(), b"hello\r\n");
    fs::remove_file(path).unwrap();
    let result=apply("inspectionFiles",json!({"token":output["token"],"modelFiles":[{"relativePath":"index.js","hash":hash(b"hello\n")},{"relativePath":"deleted.js","hash":hash(b"deleted") }]}),&mut state).unwrap();
    assert_eq!(result["statuses"][0]["status"], "unchanged");
    assert_eq!(result["statuses"][1]["status"], "deleted");
    assert_eq!(result["modified"], true);
    let request = json!({"token":output["token"]});
    assert_eq!(apply("inspectionFinish", request.clone(), &mut state).unwrap()["finished"], true);
    assert!(apply("inspectionFinish", request, &mut state).is_err());
}
#[test]
fn late_read_error_and_duplicate_path_never_write_private_snapshots() {
    let fixture = Fixture::new();
    let directory = fixture.directory("snapshots");
    let path = fixture.0.join("file");
    fs::write(&path, b"hello").unwrap();
    let mut state = State::default();
    for files in [
        json!([{"relativePath":"a","path":path},{"relativePath":"b","path":fixture.0.join("missing")}]),
        json!([{"relativePath":"a","path":path},{"relativePath":"a","path":path}]),
    ] {
        assert!(
            apply(
                "inspectionBegin",
                json!({"files":files,"workspaceRoot":false,"snapshotDirectory":directory}),
                &mut state
            )
            .is_err(),
        );
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        assert!(state.plans.is_empty());
    }
}
#[test]
fn empty_model_is_not_modified_even_when_current_files_exist() {
    let fixture = Fixture::new();
    let directory = fixture.directory("snapshots");
    let path = fixture.0.join("file");
    fs::write(&path, b"hello").unwrap();
    let mut state = State::default();
    let output=apply("inspectionBegin",json!({"files":[{"relativePath":"a","path":path}],"workspaceRoot":false,"snapshotDirectory":directory}),&mut state).unwrap();
    let result =
        apply("inspectionFiles", json!({"token":output["token"],"modelFiles":[]}), &mut state)
            .unwrap();
    assert_eq!(result["modified"], false);
    assert_eq!(result["statuses"][0]["status"], "new");
}

#[test]
fn canonical_platform_relative_labels_preserve_nested_separators() {
    let fixture = Fixture::new();
    let nested = fixture.directory("nested");
    let path = nested.join("file.js");
    fs::write(&path, b"text").unwrap();
    let output = std::process::Command::new("node")
        .args([
            "-e",
            "process.stdout.write(require('node:path').relative(process.argv[1],process.argv[2]))",
        ])
        .arg(&fixture.0)
        .arg(&path)
        .output()
        .unwrap();
    assert!(output.status.success());
    let label = String::from_utf8(output.stdout).unwrap();
    let directory = fixture.directory("snapshots");
    let mut state = State::default();
    let snapshot=apply("inspectionBegin",json!({"files":[{"relativePath":label,"path":path}],"workspaceRoot":false,"snapshotDirectory":directory}),&mut state).unwrap();
    assert_eq!(snapshot["files"][0]["relativePath"], label);
    let opposite =
        if std::path::MAIN_SEPARATOR == '\\' { "nested/file.js" } else { r"nestedile.js" };
    let result=apply("inspectionFiles",json!({"token":snapshot["token"],"modelFiles":[{"relativePath":opposite,"hash":hash(b"text")}]}),&mut state).unwrap();
    assert_eq!(result["statuses"][0]["status"], "new");
    assert_eq!(result["statuses"][1]["status"], "deleted");
}

#[test]
fn malformed_root_bitmap_declines_before_any_private_snapshot_write() {
    let fixture = Fixture::new();
    let directory = fixture.directory("snapshots");
    let file = fixture.0.join("first");
    let bitmap = fixture.0.join(".bitmap");
    fs::write(&file, b"text").unwrap();
    fs::write(&bitmap, b"{,}").unwrap();
    let mut state = State::default();
    assert!(apply("inspectionBegin",json!({"files":[{"relativePath":"first","path":file},{"relativePath":".bitmap","path":bitmap}],"workspaceRoot":true,"snapshotDirectory":directory}),&mut state).is_err());
    assert_eq!(fs::read_dir(directory).unwrap().count(), 0);
    assert!(state.plans.is_empty());
}

#[test]
fn caller_snapshot_hash_verification_declines_before_private_writes() {
    let fixture = Fixture::new();
    let directory = fixture.directory("snapshots");
    let path = fixture.0.join("file");
    fs::write(&path, b"fresh\r\n").unwrap();
    let mut state = State::default();
    for (raw, snapshot) in
        [(hash(b"old\n"), hash(b"fresh\r\n")), (hash(b"fresh\r\n"), hash(b"fresh\n"))]
    {
        assert!(apply("inspectionBegin",json!({"files":[{"relativePath":"file","path":path,"rawHash":raw,"snapshotHash":snapshot}],"workspaceRoot":false,"snapshotDirectory":directory}),&mut state).is_err());
        assert_eq!(fs::read_dir(&directory).unwrap().count(), 0);
        assert!(state.plans.is_empty());
    }
    assert!(apply("inspectionBegin",json!({"files":[{"relativePath":"file","path":path,"rawHash":hash(b"fresh\r\n"),"snapshotHash":hash(b"fresh\r\n")}],"workspaceRoot":false,"snapshotDirectory":directory}),&mut state).is_ok());
}

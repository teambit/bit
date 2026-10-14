use super::{merge, read, remove_for_update, restore_after_failure, write};
use pretty_assertions::assert_eq;
use serde_json::{Map, Value, json};
use std::fs;

const LOCKFILE: &str = "lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:

  .: {}

bit:
  depsRequiringBuild:
    - esbuild@0.20.0
  restoredFromModel: true
";

fn object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(object) => object,
        _ => panic!("expected an object"),
    }
}

#[test]
fn reads_the_bit_block() {
    let dir = tempfile::tempdir().expect("temp dir");
    assert_eq!(read(dir.path()), None);
    fs::write(dir.path().join("pnpm-lock.yaml"), LOCKFILE).expect("write");
    assert_eq!(
        read(dir.path()),
        Some(object(
            json!({ "depsRequiringBuild": ["esbuild@0.20.0"], "restoredFromModel": true })
        )),
    );
}

#[test]
fn an_uncomputed_list_keeps_the_recorded_one() {
    let pre = object(json!({ "depsRequiringBuild": ["a"], "restoredFromModel": true }));
    assert_eq!(merge(Some(pre.clone()), None), Some(pre.clone()));
    assert_eq!(
        merge(Some(pre), Some(&["b".to_string()])),
        Some(object(json!({ "depsRequiringBuild": ["b"], "restoredFromModel": true }))),
    );
    assert_eq!(merge(None, None), None);
}

#[test]
fn writes_the_bit_block_only_on_change() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("pnpm-lock.yaml");
    fs::write(&path, LOCKFILE).expect("write");
    write(dir.path(), object(json!({ "depsRequiringBuild": ["esbuild@0.20.0"] })))
        .expect("unchanged");
    assert_eq!(fs::read_to_string(&path).expect("read"), LOCKFILE);
    write(dir.path(), object(json!({ "depsRequiringBuild": ["a@1.0.0", "esbuild@0.20.0"] })))
        .expect("changed");
    assert_eq!(
        read(dir.path()),
        Some(object(
            json!({ "depsRequiringBuild": ["a@1.0.0", "esbuild@0.20.0"], "restoredFromModel": true })
        )),
    );
}

#[test]
fn writing_without_a_lockfile_does_nothing() {
    let dir = tempfile::tempdir().expect("temp dir");
    write(dir.path(), object(json!({ "depsRequiringBuild": [] }))).expect("no lockfile");
    assert!(
        !dir.path()
            .join("pnpm-lock.yaml")
            .exists(),
    );
}

#[test]
fn update_removes_and_failure_restores_the_lockfile() {
    let dir = tempfile::tempdir().expect("temp dir");
    let path = dir.path().join("pnpm-lock.yaml");
    fs::write(&path, LOCKFILE).expect("write");
    assert_eq!(remove_for_update(dir.path(), false).expect("no update"), None);
    let saved = remove_for_update(dir.path(), true).expect("update");
    assert!(!path.exists());
    restore_after_failure(dir.path(), saved).expect("restore");
    assert_eq!(fs::read_to_string(&path).expect("read"), LOCKFILE);
}

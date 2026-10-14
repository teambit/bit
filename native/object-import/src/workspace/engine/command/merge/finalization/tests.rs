use super::{Input, prepare};
use crate::workspace::engine::command::scratch::Directory;
use serde_json::{Value, json};
use std::{fs, path::Path};

fn write(root: &Path, name: &str, bytes: &[u8]) {
    let path = root.join(name);
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(path, bytes).unwrap();
}
fn fixture() -> (Directory, Value) {
    let directory = Directory::create().unwrap();
    write(&directory.0, ".bit/index.json", b"{\"components\":[],\"lanes\":[]}");
    write(
        &directory.0,
        ".bitmap",
        br#"{"alpha":{"scope":"scope","version":"1.0.0","rootDir":"alpha","mainFile":"index.js"}}"#,
    );
    write(&directory.0, "alpha/index.js", b"module.exports = 1;\n");
    write(&directory.0, "node_modules/@scope/alpha/package.json", br#"{"name":"@scope/alpha","version":"1.0.0","componentId":{"scope":"scope","name":"alpha","version":"1.0.0"},"dependencies":{},"devDependencies":{},"peerDependencies":{},"_bit_local":true}"#);
    let version = json!({"files":[{"relativePath":"index.js"}],"packageDependencies":{},
        "devPackageDependencies":{},"peerPackageDependencies":{},"extensions":[{
        "name":"teambit.dependencies/dependency-resolver","data":{"packageName":"@scope/alpha"}}]});
    (directory, version)
}
#[test]
fn new_links_are_planned_without_writes_or_declined_before_writes_on_non_unix() {
    let (directory, version) = fixture();
    let manifest = directory.0.join("node_modules/@scope/alpha/package.json");
    let before = fs::read(&manifest).unwrap();
    let result = prepare(
        &directory.0,
        &[Input {
            identity: "scope/alpha",
            directory: "alpha",
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            version: &version,
        }],
        false,
    );
    if cfg!(unix) {
        assert_eq!(result.unwrap().links.len(), 1);
    } else {
        assert!(result.is_err());
    }
    assert_eq!(fs::read(manifest).unwrap(), before);
    assert!(!directory.0.join(".bit/staged-snaps").exists());
    assert!(!directory.0.join(".bit/staged-config").exists());
    assert!(!directory.0.join("node_modules/@scope/alpha/index.js").exists());
    assert_eq!(fs::read(directory.0.join("alpha/index.js")).unwrap(), b"module.exports = 1;\n");
}

#[cfg(unix)]
#[test]
fn existing_links_remain_eligible_and_do_not_get_replaced_during_preparation() {
    let (directory, version) = fixture();
    let link = directory.0.join("node_modules/@scope/alpha/index.js");
    let source = directory.0.join("alpha/index.js");
    std::os::unix::fs::symlink(&source, &link).unwrap();
    let prepared = prepare(
        &directory.0,
        &[Input {
            identity: "scope/alpha",
            directory: "alpha",
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            version: &version,
        }],
        false,
    )
    .unwrap();
    assert!(prepared.links.is_empty());
    assert_eq!(fs::read_link(link).unwrap(), source);
    assert!(!directory.0.join(".bit/staged-snaps").exists());
}

#[test]
fn lane_snapshot_stages_current_lane_config_and_validates_its_original_bytes() {
    let (directory, version) = fixture();
    let path = directory.0.join(".bitmap");
    let mut bitmap: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    bitmap["_bit_lane"] = json!({"id":{"scope":"scope","name":"feature"},"exported":true});
    fs::write(path, serde_json::to_vec(&bitmap).unwrap()).unwrap();
    write(&directory.0, ".bit/staged-config/main.json", b"[]");
    write(&directory.0, ".bit/staged-config/scope/feature.json", b"[]");
    let mut prepared = super::Prepared {
        proofs: Vec::new(),
        writes: Vec::new(),
        links: Vec::new(),
        copies: Vec::new(),
    };
    super::staged::prepare(
        &directory.0,
        &[Input {
            identity: "scope/alpha",
            directory: "alpha",
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            version: &version,
        }],
        &mut prepared,
    )
    .unwrap();
    let config = directory.0.join(".bit/staged-config/scope/feature.json");
    let bytes = &prepared.writes
        .iter()
        .find(|(path, _)| *path == config)
        .unwrap()
        .1;
    let rows: Value = serde_json::from_slice(bytes).unwrap();
    assert_eq!(rows[0]["id"]["version"], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    assert!(
        !prepared.writes
            .iter()
            .any(|(path, _)| *path == directory.0.join(".bit/staged-config/main.json")),
    );
    assert_eq!(fs::read(&config).unwrap(), b"[]");
    prepared.validate().unwrap();
    fs::write(config, b"[{}]").unwrap();
    assert!(prepared.validate().is_err());
}

#[test]
fn scope_only_snapshot_stages_hashes_without_workspace_config_or_package_writes() {
    let (directory, version) = fixture();
    let prepared = prepare(
        &directory.0,
        &[Input {
            identity: "scope/hidden",
            directory: "",
            hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            version: &version,
        }],
        false,
    )
    .unwrap();
    assert_eq!(prepared.writes.len(), 2);
    assert!(
        prepared.writes
            .iter()
            .all(|(path, _)| path == &directory.0.join(".bit/staged-snaps")
                || path == &directory.0.join(".bit/index.json")),
    );
    assert!(prepared.links.is_empty());
    assert!(prepared.copies.is_empty());
    assert!(!directory.0.join(".bit/staged-config").exists());
}

#[test]
fn snapshot_finalization_keeps_planned_import_index_entries_and_original_freshness_proof() {
    let (directory, _) = fixture();
    let mut planned = prepare(&directory.0, &[], false).unwrap();
    let imported = json!({"components":[{"id":{"scope":"scope","name":"new"},"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}],"lanes":[{"id":{"scope":"scope","name":"incoming"},"hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}]});
    planned
        .imported_index(&directory.0, Some(&imported))
        .unwrap();
    planned.validate().unwrap();
    assert_eq!(
        fs::read(directory.0.join(".bit/index.json")).unwrap(),
        b"{\"components\":[],\"lanes\":[]}",
    );
    planned.commit().unwrap();
    let persisted: Value =
        serde_json::from_slice(&fs::read(directory.0.join(".bit/index.json")).unwrap()).unwrap();
    assert_eq!(persisted, imported);
    assert!(planned.validate().is_err());
}

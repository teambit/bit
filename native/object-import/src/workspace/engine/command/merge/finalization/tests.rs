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

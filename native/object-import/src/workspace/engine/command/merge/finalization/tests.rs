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
            semantic_version: None,
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
            semantic_version: None,
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
            semantic_version: None,
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
    prepared
        .mark_lane_new(&directory.0, &["scope/alpha".into()])
        .unwrap();
    let bytes = &prepared.writes
        .iter()
        .find(|(path, _)| *path == config)
        .unwrap()
        .1;
    let marked: Value = serde_json::from_slice(bytes).unwrap();
    assert_eq!(marked[0]["componentMapObject"]["onLanesOnly"], true);
    assert_eq!(marked[0]["componentMapObject"]["isAvailableOnCurrentLane"], true);
    let text = std::str::from_utf8(bytes).unwrap();
    assert!(
        text.find(r#""onLanesOnly""#).unwrap()
            < text.find(r#""isAvailableOnCurrentLane""#).unwrap(),
    );
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
fn existing_lane_only_marker_is_retained_in_staged_configuration() {
    let (directory, version) = fixture();
    let bitmap_path = directory.0.join(".bitmap");
    let mut bitmap: Value = serde_json::from_slice(&fs::read(&bitmap_path).unwrap()).unwrap();
    bitmap["_bit_lane"] = json!({"id":{"scope":"scope","name":"feature"},"exported":true});
    bitmap["alpha"]["onLanesOnly"] = json!(true);
    fs::write(bitmap_path, serde_json::to_vec(&bitmap).unwrap()).unwrap();
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
            semantic_version: None,
            version: &version,
        }],
        &mut prepared,
    )
    .unwrap();
    prepared.validate().unwrap();
    let staged = directory.0.join(".bit/staged-config/scope/feature.json");
    let bytes = &prepared.writes
        .iter()
        .find(|(path, _)| *path == staged)
        .unwrap()
        .1;
    let rows: Value = serde_json::from_slice(bytes).unwrap();
    assert_eq!(rows[0]["componentMapObject"]["onLanesOnly"], true);
    assert_eq!(rows[0]["componentMapObject"]["isAvailableOnCurrentLane"], true);
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
            semantic_version: None,
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

#[test]
fn package_component_id_preserves_existing_order_and_serializes_first_snapshot_id() {
    for new_component in [false, true] {
        let (directory, mut version) = fixture();
        version["files"] = json!([]);
        let manifest = directory.0.join("node_modules/@scope/alpha/package.json");
        if new_component {
            let mut package: Value = serde_json::from_slice(&fs::read(&manifest).unwrap()).unwrap();
            package["componentId"] = json!({"name":"alpha","scope":"scope"});
            fs::write(&manifest, serde_json::to_vec(&package).unwrap()).unwrap();
        }
        let prepared = prepare(
            &directory.0,
            &[Input {
                identity: "scope/alpha",
                directory: "alpha",
                hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
                semantic_version: None,
                version: &version,
            }],
            false,
        )
        .unwrap();
        let (_, bytes) = prepared.writes
            .iter()
            .find(|(path, _)| *path == manifest)
            .unwrap();
        let package: Value = serde_json::from_slice(bytes).unwrap();
        let keys: Vec<_> = package["componentId"]
            .as_object()
            .unwrap()
            .keys()
            .map(String::as_str)
            .collect();
        assert_eq!(
            keys,
            if new_component {
                vec!["name", "version", "scope"]
            } else {
                vec!["scope", "name", "version"]
            },
        );
        assert_eq!(package["componentId"]["version"], "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    }
}

#[test]
fn tag_package_and_staged_config_use_semver_while_staged_snaps_use_object_hash() {
    let (directory, mut version) = fixture();
    version["files"] = json!([]);
    let hash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    let prepared = prepare(
        &directory.0,
        &[Input {
            identity: "scope/alpha",
            directory: "alpha",
            hash,
            semantic_version: Some("2.1.0-beta.2"),
            version: &version,
        }],
        false,
    )
    .unwrap();
    let bytes = |relative: &str| {
        &prepared.writes
            .iter()
            .find(|(path, _)| *path == directory.0.join(relative))
            .unwrap()
            .1
    };
    let package: Value =
        serde_json::from_slice(bytes("node_modules/@scope/alpha/package.json")).unwrap();
    assert_eq!(package["version"], "2.1.0-beta.2");
    assert_eq!(package["componentId"]["version"], "2.1.0-beta.2");
    let staged: Value = serde_json::from_slice(bytes(".bit/staged-config/main.json")).unwrap();
    assert_eq!(staged[0]["id"]["version"], "2.1.0-beta.2");
    assert_eq!(bytes(".bit/staged-snaps"), hash.as_bytes());
    assert!(!directory.0.join(".bit/staged-snaps").exists());
}
#[cfg(unix)]
#[test]
fn env_root_packages_linked_into_the_pnpm_store_are_written_through_the_link() {
    let directory = Directory::create().unwrap();
    let root = &directory.0;
    let store = root.join("node_modules/.pnpm/@scope+alpha@file+alpha/node_modules/@scope/alpha");
    fs::create_dir_all(&store).unwrap();
    let link = root.join("node_modules/.bit_roots/teambit.harmony_node/node_modules/@scope/alpha");
    fs::create_dir_all(link.parent().unwrap()).unwrap();
    std::os::unix::fs::symlink(
        "../../../../.pnpm/@scope+alpha@file+alpha/node_modules/@scope/alpha",
        &link,
    )
    .unwrap();
    let mut output = super::Prepared {
        proofs: Vec::new(),
        writes: Vec::new(),
        links: Vec::new(),
        copies: Vec::new(),
    };
    let resolved = super::packages::injected(root, &link, &mut output).unwrap();
    assert_eq!(
        resolved,
        root.join("node_modules/.pnpm").join("@scope+alpha@file+alpha/node_modules/@scope/alpha"),
    );
    assert_eq!(output.proofs.len(), 1);
    let plain = root.join("node_modules/@scope/alpha");
    assert_eq!(super::packages::injected(root, &plain, &mut output).unwrap(), plain);
    let outside =
        root.join("node_modules/.bit_roots/teambit.harmony_node/node_modules/@scope/beta");
    std::os::unix::fs::symlink(root.join("alpha"), &outside).unwrap();
    fs::create_dir_all(root.join("alpha")).unwrap();
    assert!(super::packages::injected(root, &outside, &mut output).is_err());
}
#[test]
fn a_scope_without_an_index_starts_an_empty_one() {
    let directory = Directory::create().unwrap();
    write(
        &directory.0,
        ".bitmap",
        br#"{"alpha":{"scope":"","version":"","rootDir":"alpha","mainFile":"index.js"}}"#,
    );
    let version = json!({"files":[]});
    let mut prepared = super::Prepared {
        proofs: Vec::new(),
        writes: Vec::new(),
        links: Vec::new(),
        copies: Vec::new(),
    };
    let input = Input {
        identity: "scope/alpha",
        directory: "",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    super::staged::prepare(&directory.0, &[input], &mut prepared).unwrap();
    let index = directory.0.join(".bit/index.json");
    let bytes = &prepared.writes
        .iter()
        .find(|(path, _)| *path == index)
        .unwrap()
        .1;
    let written: Value = serde_json::from_slice(bytes).unwrap();
    assert_eq!(written, json!({"components":[],"lanes":[]}));
}

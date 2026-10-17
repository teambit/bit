use super::{Input, tests::fixture};
use serde_json::{Value, json};
use std::fs;

#[test]
fn build_staging_persists_only_snap_ids_before_any_objects_or_other_metadata() {
    let (directory, version) = fixture();
    let index = directory.0.join(".bit/index.json");
    let bitmap = fs::read(directory.0.join(".bitmap")).unwrap();
    let original_index = fs::read(&index).unwrap();
    let input = Input {
        identity: "scope/alpha",
        directory: "",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let mut prepared = super::prepare_snapshot_publication(&directory.0, &[input], &[]).unwrap();
    let bytes = prepared.stage_snaps(&directory.0).unwrap();
    assert_eq!(bytes, b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    prepared.validate().unwrap();
    assert_eq!(fs::read(index).unwrap(), original_index);
    assert_eq!(fs::read(directory.0.join(".bitmap")).unwrap(), bitmap);
    assert!(!directory.0.join(".bit/objects").exists());
    assert!(!directory.0.join(".bit/staged-config").exists());
    assert!(
        !prepared.writes
            .iter()
            .any(|(path, _)| path.ends_with("staged-snaps")),
    );
}

#[test]
fn snapshot_stages_config_while_merge_keeps_its_configured_component_guard() {
    let (directory, version) = fixture();
    let path = directory.0.join(".bitmap");
    let mut bitmap: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    bitmap["alpha"]["config"] = json!({"aspect/env":{"enabled":true,"__specific":true}});
    fs::write(path, serde_json::to_vec(&bitmap).unwrap()).unwrap();
    let input = Input {
        identity: "scope/alpha",
        directory: "alpha",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let skipped = vec!["scope/alpha".to_owned()];
    assert!(super::prepare_publication(&directory.0, &[input], true, &skipped).is_err());
    let input = Input {
        identity: "scope/alpha",
        directory: "alpha",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let prepared = super::prepare_snapshot_publication(&directory.0, &[input], &skipped).unwrap();
    let (_, bytes) = prepared.writes
        .iter()
        .find(|(path, _)| path.ends_with("staged-config/main.json"))
        .unwrap();
    let rows: Value = serde_json::from_slice(bytes).unwrap();
    assert_eq!(rows[0]["config"], bitmap["alpha"]["config"]);
    assert_eq!(rows[0]["componentMapObject"]["config"], json!({"aspect/env":{"enabled":true}}));
    assert!(!directory.0.join(".bit/staged-config/main.json").exists());
}

#[cfg(windows)]
#[test]
fn windows_snapshot_links_files_and_source_directory_with_ide_types() {
    let (directory, mut version) = fixture();
    version["mainFile"] = json!("index.js");
    let input = Input {
        identity: "scope/alpha",
        directory: "alpha",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let prepared = super::prepare_snapshot_publication(&directory.0, &[input], &[]).unwrap();
    assert_eq!(prepared.links.len(), 2);
    prepared.commit().unwrap();
    let package = directory.0.join("node_modules/@scope/alpha");
    let value: Value =
        serde_json::from_slice(&fs::read(package.join("package.json")).unwrap()).unwrap();
    assert_eq!(value["types"], "_src/index.js");
    assert!(
        same_file::is_same_file(package.join("index.js"), directory.0.join("alpha/index.js"))
            .unwrap(),
    );
    assert!(same_file::is_same_file(package.join("_src"), directory.0.join("alpha")).unwrap());
    let input = Input {
        identity: "scope/alpha",
        directory: "alpha",
        hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        semantic_version: None,
        version: &version,
    };
    let prepared = super::prepare_snapshot_publication(&directory.0, &[input], &[]).unwrap();
    assert!(prepared.links.is_empty());
}

#[cfg(unix)]
#[test]
fn snapshot_keeps_existing_dangling_source_symlinks_and_protects_their_targets() {
    let (directory, mut version) = fixture();
    version["mainFile"] = json!("index.js");
    let link = directory.0.join("node_modules/@scope/alpha/index.js");
    let missing = directory.0.join("missing-original/index.js");
    std::os::unix::fs::symlink(&missing, &link).unwrap();
    let input = Input {
        identity: "scope/alpha",
        directory: "alpha",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let prepared = super::prepare_snapshot_publication(&directory.0, &[input], &[]).unwrap();
    assert!(prepared.links.is_empty());
    prepared.validate().unwrap();
    assert_eq!(fs::read_link(&link).unwrap(), missing);
    fs::remove_file(&link).unwrap();
    std::os::unix::fs::symlink(directory.0.join("other-missing/index.js"), &link).unwrap();
    assert!(prepared.validate().is_err());
}

#[test]
fn workspace_root_snapshot_stages_scope_metadata_without_creating_a_package_or_links() {
    let (directory, version) = fixture();
    let path = directory.0.join(".bitmap");
    let mut bitmap: Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
    bitmap["alpha"]["rootDir"] = json!(".");
    fs::write(path, serde_json::to_vec(&bitmap).unwrap()).unwrap();
    let input = Input {
        identity: "scope/alpha",
        directory: ".",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let mut prepared = super::prepare_snapshot_publication(&directory.0, &[input], &[]).unwrap();
    prepared
        .resolve_licenses(&directory.0, &[], &[])
        .unwrap();
    assert!(prepared.links.is_empty());
    assert!(prepared.copies.is_empty());
    assert!(
        prepared
            .package_manifest_plans()
            .unwrap()
            .is_empty(),
    );
    assert!(
        prepared.writes
            .iter()
            .any(|(path, _)| path.ends_with("staged-config/main.json")),
    );
}

#[cfg(unix)]
#[test]
fn tracked_package_manifest_is_linked_as_source_without_a_generated_manifest_write() {
    let (directory, mut version) = fixture();
    version["mainFile"] = json!("index.js");
    version["files"] = json!([{"relativePath":"index.js"},{"relativePath":"package.json"}]);
    fs::write(directory.0.join("alpha/package.json"), b"{\"name\":\"tracked-package\"}").unwrap();
    let input = Input {
        identity: "scope/alpha",
        directory: "alpha",
        hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        semantic_version: None,
        version: &version,
    };
    let inputs = [input];
    let mut prepared = super::prepare_snapshot_publication(&directory.0, &inputs, &[]).unwrap();
    prepared
        .resolve_licenses(&directory.0, &inputs, &[])
        .unwrap();
    assert!(
        prepared
            .package_manifest_plans()
            .unwrap()
            .is_empty(),
    );
    prepared.commit().unwrap();
    let manifest = directory.0.join("node_modules/@scope/alpha/package.json");
    assert_eq!(fs::read_link(&manifest).unwrap(), directory.0.join("alpha/package.json"));
    assert_eq!(fs::read(manifest).unwrap(), b"{\"name\":\"tracked-package\"}");
}

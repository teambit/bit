use super::LocalBatch;
use serde_json::{Value, json};
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
fn fixture() -> PathBuf {
    let root = std::env::temp_dir()
        .join(format!(
            "bit-local-remove-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir_all(root.join(".bit")).unwrap();
    let mut bitmap = json!({});
    for name in ["alpha", "beta"] {
        fs::create_dir_all(root.join(name)).unwrap();
        fs::write(root.join(name).join("index.js"), "module.exports=1;").unwrap();
        fs::create_dir_all(root.join("node_modules/@scope").join(name)).unwrap();
        bitmap[name] = json!({"name":name,"scope":"","version":"","defaultScope":"scope","mainFile":"index.js","rootDir":name});
    }
    bitmap["$schema-version"] = json!("17.0.0");
    fs::write(root.join(".bitmap"), crate::inspection::render_workspace_bitmap(&bitmap).unwrap())
        .unwrap();
    root
}
#[test]
fn batch_publishes_once_and_removes_package_dependencies() {
    let root = fixture();
    fs::write(
        root.join("package.json"),
        "{\"dependencies\":{\"@scope/alpha\":\"*\",\"@scope/beta\":\"*\",\"other\":\"1\"}}\n",
    )
    .unwrap();
    let batch =
        LocalBatch::prepare(&root, &["scope/alpha".into(), "scope/beta".into()], false, false, &[])
            .unwrap();
    batch.commit("2026-10-18-12-0-0").unwrap();
    assert!(!root.join("alpha").exists());
    assert!(!root.join("node_modules/@scope/beta").exists());
    let manifest: Value =
        serde_json::from_slice(&fs::read(root.join("package.json")).unwrap()).unwrap();
    assert_eq!(manifest["dependencies"], json!({"other":"1"}));
    assert_eq!(
        fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        "2026-10-18-12-0-0 remove\n",
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn track_keeps_bitmap_packages_and_configuration() {
    let root = fixture();
    let before = fs::read(root.join(".bitmap")).unwrap();
    let batch = LocalBatch::prepare(&root, &["scope/alpha".into()], false, true, &[]).unwrap();
    batch.commit("2026-10-18-12-0-0").unwrap();
    assert!(!root.join("alpha").exists());
    assert!(root.join("node_modules/@scope/alpha").is_dir());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), before);
    assert!(!root.join(".bit/bitmap-history-metadata.txt").exists());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn stale_configuration_fails_before_removing_any_source() {
    let root = fixture();
    fs::write(root.join("package.json"), r#"{"dependencies":{"@scope/alpha":"*"}}"#).unwrap();
    let batch = LocalBatch::prepare(&root, &["scope/alpha".into()], false, false, &[]).unwrap();
    fs::write(root.join("package.json"), "{}").unwrap();
    assert!(batch.commit("2026-10-18-12-0-0").is_err());
    assert!(root.join("alpha/index.js").is_file());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn root_untracking_keeps_workspace_and_nested_components() {
    let root = fixture();
    let mut bitmap = crate::parse_jsonc(&fs::read(root.join(".bitmap")).unwrap()).unwrap();
    bitmap["workspace-root"] = json!({"name":"workspace-root","scope":"","version":"","defaultScope":"scope","mainFile":"workspace.jsonc","rootDir":"."});
    fs::write(root.join("workspace.jsonc"), "{}").unwrap();
    fs::write(root.join(".bitmap"), crate::inspection::render_workspace_bitmap(&bitmap).unwrap())
        .unwrap();
    LocalBatch::prepare(&root, &["scope/workspace-root".into()], false, false, &[])
        .unwrap()
        .commit("2026-10-18-12-0-0")
        .unwrap();
    assert!(root.join("workspace.jsonc").is_file());
    assert!(root.join("alpha/index.js").is_file());
    fs::remove_dir_all(root).unwrap();
}

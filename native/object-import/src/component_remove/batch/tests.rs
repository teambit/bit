use super::NewBatch;
use serde_json::json;
use std::{
    fs,
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
};
static NEXT: AtomicU64 = AtomicU64::new(0);
fn fixture() -> PathBuf {
    let serial = NEXT.fetch_add(1, Ordering::Relaxed);
    let root =
        std::env::temp_dir().join(format!("bit-stash-remove-{}-{serial}", std::process::id()));
    fs::create_dir_all(root.join(".bit")).unwrap();
    let mut rows = serde_json::Map::new();
    for name in ["alpha", "beta"] {
        fs::create_dir_all(root.join(name)).unwrap();
        fs::write(root.join(name).join("index.js"), "module.exports=1;").unwrap();
        rows.insert(name.into(), json!({"name":name,"scope":"","defaultScope":"scope","version":"","mainFile":"index.js","rootDir":name}));
    }
    rows.insert("$schema-version".into(), json!("17.0.0"));
    fs::write(root.join(".bitmap"), crate::inspection::render_bitmap(&json!(rows)).unwrap())
        .unwrap();
    root
}
#[test]
fn removes_new_components_with_one_bitmap_history_entry() {
    let root = fixture();
    let batch = NewBatch::prepare(&root, &["scope/alpha".into(), "scope/beta".into()]).unwrap();
    batch.commit("2026-10-17-12-0-0").unwrap();
    let rows = crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).unwrap()).unwrap();
    assert!(rows.get("alpha").is_none());
    assert!(rows.get("beta").is_none());
    assert!(!root.join("alpha").exists());
    assert!(!root.join("beta").exists());
    assert_eq!(
        fs::read_to_string(root.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        "2026-10-17-12-0-0 remove (by N/A)\n",
    );
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn stale_batch_does_not_remove_any_files() {
    let root = fixture();
    let batch = NewBatch::prepare(&root, &["alpha".into(), "beta".into()]).unwrap();
    fs::write(root.join(".bitmap"), "{}").unwrap();
    assert!(batch.commit("2026-10-17-12-0-0").is_err());
    assert!(root.join("alpha/index.js").exists());
    assert!(root.join("beta/index.js").exists());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn used_new_aspect_is_rejected_before_any_removal() {
    let root = fixture();
    let facts = [
        json!({"identity":"scope/beta","extensions":[{"extensionId":{"scope":"scope","name":"alpha","version":"latest"}}]}),
    ];
    let error =
        NewBatch::prepare_with_components(&root, &["scope/alpha".into()], &facts).err().unwrap();
    assert!(error.to_string().starts_with("Unable to remove scope/beta."));
    assert!(root.join("alpha/index.js").exists());
    assert!(root.join("beta/index.js").exists());
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn a_changed_cleanup_control_does_not_delete_sources() {
    let root = fixture();
    fs::write(root.join("package.json"), r#"{"dependencies":{"@scope/alpha":"*"}}"#).unwrap();
    let batch = NewBatch::prepare(&root, &["alpha".into()]).unwrap();
    fs::write(root.join("package.json"), r#"{"dependencies":{"@scope/alpha":"2.0.0"}}"#).unwrap();
    assert!(batch.commit("2026-10-17-12-0-0").is_err());
    assert!(root.join("alpha/index.js").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn nested_sources_remove_only_their_immediate_empty_parent() {
    let root = fixture();
    fs::create_dir_all(root.join("ancestor/parent")).unwrap();
    fs::rename(root.join("alpha"), root.join("ancestor/parent/alpha")).unwrap();
    let mut bitmap =
        crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).unwrap()).unwrap();
    bitmap["alpha"]["rootDir"] = json!("ancestor/parent/alpha");
    fs::write(root.join(".bitmap"), crate::inspection::render_bitmap(&bitmap).unwrap()).unwrap();
    let batch = NewBatch::prepare(&root, &["alpha".into()]).unwrap();
    batch.commit("2026-10-17-12-0-0").unwrap();
    assert!(!root.join("ancestor/parent").exists());
    assert!(root.join("ancestor").is_dir());
    assert!(root.join("beta/index.js").is_file());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn nested_sources_preserve_a_parent_with_unrelated_files() {
    let root = fixture();
    fs::create_dir_all(root.join("parent")).unwrap();
    fs::rename(root.join("alpha"), root.join("parent/alpha")).unwrap();
    fs::write(root.join("parent/unrelated.txt"), "retain").unwrap();
    let mut bitmap =
        crate::recovery::jsonc::parse(&fs::read(root.join(".bitmap")).unwrap()).unwrap();
    bitmap["alpha"]["rootDir"] = json!("parent/alpha");
    fs::write(root.join(".bitmap"), crate::inspection::render_bitmap(&bitmap).unwrap()).unwrap();
    let batch = NewBatch::prepare(&root, &["alpha".into()]).unwrap();
    batch.commit("2026-10-17-12-0-0").unwrap();
    assert!(!root.join("parent/alpha").exists());
    assert_eq!(fs::read_to_string(root.join("parent/unrelated.txt")).unwrap(), "retain");
    fs::remove_dir_all(root).unwrap();
}

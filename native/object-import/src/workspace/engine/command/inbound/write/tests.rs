use super::{History, Prepared, safe_destination, unique_name};
use serde_json::json;
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicUsize, Ordering},
};
static NEXT: AtomicUsize = AtomicUsize::new(0);
fn root() -> PathBuf {
    let root = std::env::temp_dir()
        .join(format!(
            "bit-inbound-writer-{}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed),
        ));
    fs::create_dir_all(&root).unwrap();
    fs::create_dir_all(root.join(".bit")).unwrap();
    root
}
fn history(root: &Path) -> History {
    History {
        backup: root.join(".bit/bitmap-history/.bitmap-2026-1-2-3-4-5"),
        metadata: root.join(".bit/bitmap-history-metadata.txt"),
        metadata_before: None,
        file_id: "2026-1-2-3-4-5".into(),
    }
}
#[test]
fn same_name_from_different_scope_declines_before_bitmap_overwrite() {
    let rows = json!({"alpha":{"name":"alpha","scope":"first.scope"}});
    assert!(unique_name(rows.as_object().unwrap(), "alpha").is_err());
}
#[test]
fn writer_rolls_back_partial_files_when_later_destination_conflicts() {
    let root = root();
    fs::write(root.join(".bitmap"), b"before").unwrap();
    let plan = Prepared {
        root: root.clone(),
        bitmap_before: b"before".to_vec(),
        bitmap_after: b"after".to_vec(),
        files: vec![(root.join("a"), b"first".to_vec()), (root.join("a/b"), b"second".to_vec())],
        history: history(&root),
    };
    assert!(plan.commit().is_err());
    assert!(!root.join("a").exists());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), b"before");
    fs::remove_dir_all(root).unwrap();
}
#[test]
fn bitmap_replacement_preserves_old_bytes_in_history() {
    let root = root();
    fs::write(root.join(".bitmap"), b"before").unwrap();
    let plan = Prepared {
        root: root.clone(),
        bitmap_before: b"before".to_vec(),
        bitmap_after: b"after".to_vec(),
        files: Vec::new(),
        history: history(&root),
    };
    plan.commit().unwrap();
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), b"after");
    assert_eq!(
        fs::read(root.join(".bit/bitmap-history/.bitmap-2026-1-2-3-4-5")).unwrap(),
        b"before",
    );
    assert_eq!(
        fs::read(root.join(".bit/bitmap-history-metadata.txt")).unwrap(),
        b"2026-1-2-3-4-5 import\n",
    );
    fs::remove_dir_all(root).unwrap();
}
#[cfg(unix)]
#[test]
fn symlinked_parent_is_rejected_before_workspace_write() {
    use std::os::unix::fs::symlink;
    let root = root();
    symlink(std::env::temp_dir(), root.join("linked")).unwrap();
    assert!(safe_destination(&root, &root.join("linked/component/index.js")).is_err());
    fs::remove_dir_all(root).unwrap();
}

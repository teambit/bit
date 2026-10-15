use super::{
    History, Prepared, Replacement, Target, WorkspaceFiles, safe_destination, unique_name,
};
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
        changes: WorkspaceFiles {
            additions: vec![
                (root.join("a"), b"first".to_vec()),
                (root.join("a/b"), b"second".to_vec()),
            ],
            ..WorkspaceFiles::default()
        },
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
        changes: WorkspaceFiles::default(),
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

#[test]
fn writer_restores_an_existing_file_after_a_later_replacement_fails() {
    let root = root();
    let file = root.join("existing.js");
    fs::write(root.join(".bitmap"), b"before").unwrap();
    fs::write(&file, b"original").unwrap();
    let plan = Prepared {
        root: root.clone(),
        bitmap_before: b"before".to_vec(),
        bitmap_after: b"after".to_vec(),
        changes: WorkspaceFiles {
            replacements: vec![
                Replacement {
                    path: file.clone(),
                    before: b"original".to_vec(),
                    after: b"first".to_vec(),
                },
                Replacement {
                    path: file.clone(),
                    before: b"original".to_vec(),
                    after: b"second".to_vec(),
                },
            ],
            ..WorkspaceFiles::default()
        },
        history: history(&root),
    };
    assert!(plan.commit().is_err());
    assert_eq!(fs::read(&file).unwrap(), b"original");
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), b"before");
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

fn targets(ids: &[(&str, &str)]) -> Vec<Target> {
    ids.iter()
        .map(|(scope, name)| Target {
            scope: Some((*scope).to_owned()),
            name: (*name).to_owned(),
            version: "latest".to_owned(),
        })
        .collect()
}

fn owned(directories: &[&str]) -> Vec<String> {
    directories
        .iter()
        .map(|directory| (*directory).to_owned())
        .collect()
}

#[test]
fn a_parent_directory_moves_aside_for_its_child() {
    let mut directories = owned(&["bar", "bar/foo"]);
    super::directories::fix_dirs_if_nested(&mut directories, &[]);
    assert_eq!(directories, ["bar_1", "bar/foo"]);
}

#[test]
fn nested_directories_avoid_existing_components() {
    let mut directories = owned(&["foo", "comp1/foo"]);
    super::directories::fix_dirs_if_nested(&mut directories, &owned(&["foo/bar", "comp1"]));
    assert_eq!(directories, ["foo_1", "comp1_1/foo"]);
}

#[test]
fn equal_directories_move_under_their_owner() {
    let targets = targets(&[("org1.ui", "button"), ("org2.ui", "button")]);
    let mut directories = owned(&["ui/button", "ui/button"]);
    super::directories::fix_dirs_if_equal(&targets, &mut directories);
    assert_eq!(directories, ["org1/ui/button", "org2/ui/button"]);
}

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
        backup_before: None,
        attributes: super::history::Attributes::default(),
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
        policy: None,
        policy_input: None,
        write_deps: None,
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
        policy: None,
        policy_input: None,
        write_deps: None,
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
        policy: None,
        policy_input: None,
        write_deps: None,
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

#[test]
fn incomplete_policy_prevents_any_workspace_publication() {
    let root = root();
    fs::write(root.join(".bitmap"), b"before").unwrap();
    fs::write(root.join("workspace.jsonc"), b"{}").unwrap();
    let input = json!({"workspaceEntries":[],"componentDeps":[],"strategy":null});
    let policy = super::super::super::checkout_policy::Prepared::new(&root, input.clone()).unwrap();
    let plan = Prepared {
        policy: Some(policy),
        policy_input: Some(input),
        write_deps: None,
        root: root.clone(),
        bitmap_before: b"before".to_vec(),
        bitmap_after: b"after".to_vec(),
        changes: WorkspaceFiles {
            additions: vec![(root.join("source.js"), b"new".to_vec())],
            ..WorkspaceFiles::default()
        },
        history: history(&root),
    };
    assert!(plan.commit().is_err());
    assert_eq!(fs::read(root.join(".bitmap")).unwrap(), b"before");
    assert!(!root.join("source.js").exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn same_second_history_replaces_regular_backup_and_rollback_restores_preimage() {
    let root = root();
    fs::write(root.join(".bitmap"), b"source bitmap").unwrap();
    let history = history(&root);
    fs::create_dir_all(history.backup.parent().unwrap()).unwrap();
    fs::write(&history.backup, b"earlier bitmap").unwrap();
    let history = super::history::prepare(&root, Some(&history.file_id)).unwrap();
    history.publish(&root, b"import bitmap").unwrap();
    assert_eq!(fs::read(&history.backup).unwrap(), b"import bitmap");
    history.rollback();
    assert_eq!(fs::read(&history.backup).unwrap(), b"earlier bitmap");
    assert!(!history.metadata.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn existing_history_alias_declines_before_overwriting_either_name() {
    let root = root();
    let mut history = history(&root);
    fs::create_dir_all(history.backup.parent().unwrap()).unwrap();
    fs::write(&history.backup, b"earlier bitmap").unwrap();
    let alias = root.join("alias");
    fs::hard_link(&history.backup, &alias).unwrap();
    history.backup_before = Some(b"earlier bitmap".to_vec());
    assert!(history.publish(&root, b"import bitmap").is_err());
    assert_eq!(fs::read(&alias).unwrap(), b"earlier bitmap");
    assert_eq!(fs::read(&history.backup).unwrap(), b"earlier bitmap");
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn existing_history_symlink_is_rejected_without_changing_target() {
    let root = root();
    fs::write(root.join(".bitmap"), b"source bitmap").unwrap();
    let history = history(&root);
    fs::create_dir_all(history.backup.parent().unwrap()).unwrap();
    let target = root.join("outside-backup");
    fs::write(&target, b"unrelated").unwrap();
    std::os::unix::fs::symlink(&target, &history.backup).unwrap();
    assert!(super::history::prepare(&root, Some(&history.file_id)).is_err());
    assert_eq!(fs::read(&target).unwrap(), b"unrelated");
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn history_collision_copies_source_mode_and_access_time_and_restores_backup_attributes() {
    use std::{
        os::unix::fs::PermissionsExt,
        time::{Duration, UNIX_EPOCH},
    };
    let root = root();
    fs::write(root.join(".bitmap"), b"source bitmap").unwrap();
    fs::set_permissions(root.join(".bitmap"), fs::Permissions::from_mode(0o640)).unwrap();
    let source_time = UNIX_EPOCH + Duration::from_secs(1_600_000_000);
    fs::File::open(root.join(".bitmap"))
        .unwrap()
        .set_times(fs::FileTimes::new().set_accessed(source_time).set_modified(source_time))
        .unwrap();
    let history = history(&root);
    fs::create_dir_all(history.backup.parent().unwrap()).unwrap();
    fs::write(&history.backup, b"old bitmap").unwrap();
    fs::set_permissions(&history.backup, fs::Permissions::from_mode(0o600)).unwrap();
    let backup_time = source_time + Duration::from_secs(100);
    fs::File::open(&history.backup)
        .unwrap()
        .set_times(fs::FileTimes::new().set_accessed(backup_time).set_modified(backup_time))
        .unwrap();
    let history = super::history::prepare(&root, Some(&history.file_id)).unwrap();
    history.publish(&root, b"source bitmap").unwrap();
    let published = fs::metadata(&history.backup).unwrap();
    assert_eq!(published.permissions().mode() & 0o777, 0o640);
    assert_eq!(published.accessed().unwrap(), source_time);
    assert_ne!(published.modified().unwrap(), source_time);
    history.rollback();
    let restored = fs::metadata(&history.backup).unwrap();
    assert_eq!(restored.permissions().mode() & 0o777, 0o600);
    assert_eq!(restored.accessed().unwrap(), backup_time);
    assert_eq!(restored.modified().unwrap(), backup_time);
    fs::remove_dir_all(root).unwrap();
}

#[cfg(unix)]
#[test]
fn history_revalidates_source_mode_before_publication() {
    use std::os::unix::fs::PermissionsExt;
    let root = root();
    fs::write(root.join(".bitmap"), b"source bitmap").unwrap();
    let history = history(&root);
    let history = super::history::prepare(&root, Some(&history.file_id)).unwrap();
    fs::set_permissions(root.join(".bitmap"), fs::Permissions::from_mode(0o600)).unwrap();
    assert!(history.publish(&root, b"source bitmap").is_err());
    assert!(!history.backup.exists());
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn empty_history_copy_keeps_the_source_modified_time() {
    use std::time::{Duration, UNIX_EPOCH};
    let root = root();
    fs::write(root.join(".bitmap"), []).unwrap();
    let source_time = UNIX_EPOCH + Duration::from_secs(1_600_000_000);
    fs::File::options()
        .write(true)
        .open(root.join(".bitmap"))
        .unwrap()
        .set_times(fs::FileTimes::new().set_accessed(source_time).set_modified(source_time))
        .unwrap();
    let history = history(&root);
    let history = super::history::prepare(&root, Some(&history.file_id)).unwrap();
    history.publish(&root, b"").unwrap();
    let published = fs::metadata(&history.backup).unwrap();
    assert_eq!(published.modified().unwrap(), source_time);
    assert_eq!(published.accessed().unwrap(), source_time);
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn acknowledged_workspace_writes_keep_the_original_preimage_and_reject_later_tampering() {
    let root = root();
    fs::write(root.join(".bitmap"), b"before").unwrap();
    fs::write(root.join("existing.js"), b"original").unwrap();
    let plan = Prepared {
        policy: None,
        policy_input: None,
        write_deps: Some("package.json".into()),
        root: root.clone(),
        bitmap_before: b"before".to_vec(),
        bitmap_after: b"after".to_vec(),
        changes: WorkspaceFiles {
            replacements: vec![Replacement {
                path: root.join("existing.js"),
                before: b"original".to_vec(),
                after: b"incoming".to_vec(),
            }],
            ..WorkspaceFiles::default()
        },
        history: history(&root),
    };
    plan.commit().unwrap();
    let receipts = plan.published_write_receipts().unwrap();
    assert_eq!(
        receipts,
        [
            crate::command_import::write_receipt(
                &root.join("existing.js"),
                Some(b"original"),
                b"incoming"
            ),
            crate::command_import::write_receipt(&root.join(".bitmap"), Some(b"before"), b"after"),
        ],
    );
    fs::write(root.join("existing.js"), b"raced").unwrap();
    assert!(plan.published_write_receipts().is_err());
    fs::remove_dir_all(root).unwrap();
}

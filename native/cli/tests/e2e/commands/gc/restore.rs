//! Recovery compares existing object bytes and permissions, not only restored object counts.
mod cleanup;
mod conflicts;
use super::{compare, fixture, objects, orphan};
use std::{fs, os::unix::fs::PermissionsExt};

#[test]
fn bare_restore_preserves_readonly_existing_objects_unless_overwriting() {
    for command in ["gc --restore", "gc --restore-overwrite"] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let hash = orphan(scope);
        assert!(compare(&helper, "gc", false).status.success());
        objects::write(scope, "Source", &hash, b"existing object content");
        let target = objects::path(scope, "objects", &hash);
        fs::set_permissions(&target, fs::Permissions::from_mode(0o444)).unwrap();
        let restored = compare(&helper, command, false);
        assert!(restored.status.success(), "{restored:?}");
        assert!(!scope.join("deleted-objects").exists());
    }
}

#[test]
fn bare_restore_preserves_backed_up_symbolic_links() {
    let helper = fixture();
    let scope = &helper.scopes.remote_path;
    let hash = orphan(scope);
    assert!(compare(&helper, "gc", false).status.success());
    let backup = objects::path(scope, "deleted-objects", &hash);
    fs::rename(&backup, scope.join("saved-source")).unwrap();
    std::os::unix::fs::symlink("../../saved-source", &backup).unwrap();
    let restored = compare(&helper, "gc --restore", false);
    assert!(restored.status.success(), "{restored:?}");
    assert_eq!(
        fs::read_link(objects::path(scope, "objects", &hash)).unwrap(),
        std::path::Path::new("../../saved-source"),
    );
}

#[test]
fn bare_restore_treats_dangling_destination_links_as_existing_entries() {
    for command in ["gc --restore", "gc --restore-overwrite"] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let hash = orphan(scope);
        assert!(compare(&helper, "gc", false).status.success());
        assert!(compare(&helper, "gc --dry-run", false).status.success());
        let target = objects::path(scope, "objects", &hash);
        std::os::unix::fs::symlink("missing-object", &target).unwrap();
        let restored = compare(&helper, command, false);
        assert!(restored.status.success(), "{restored:?}");
        assert_eq!(target.is_symlink(), command == "gc --restore");
        assert!(
            !target
                .parent()
                .unwrap()
                .join("missing-object")
                .exists(),
        );
    }
}

#[test]
fn bare_restore_replaces_existing_symlinks_even_without_overwrite() {
    for command in ["gc --restore", "gc --restore-overwrite"] {
        let helper = fixture();
        let scope = &helper.scopes.remote_path;
        let hash = orphan(scope);
        assert!(compare(&helper, "gc", false).status.success());
        assert!(compare(&helper, "gc --dry-run", false).status.success());
        let backup = objects::path(scope, "deleted-objects", &hash);
        fs::remove_file(&backup).unwrap();
        std::os::unix::fs::symlink("new-link-target", &backup).unwrap();
        let target = objects::path(scope, "objects", &hash);
        std::os::unix::fs::symlink("old-link-target", &target).unwrap();
        let restored = compare(&helper, command, false);
        assert!(restored.status.success(), "{restored:?}");
        assert_eq!(fs::read_link(&target).unwrap(), std::path::Path::new("new-link-target"));
    }
}

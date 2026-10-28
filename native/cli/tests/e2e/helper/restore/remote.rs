//! Restore remote children without deleting a running scope server's current directory.
use super::{Path, fs, io, remove};

/// Keep a server's current directory while removing every persisted child before replay.
pub(in crate::helper) fn contents(path: &Path) {
    let metadata = match fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return,
        Err(error) => panic!("fixture metadata {}: {error}", path.display()),
    };
    if metadata.file_type().is_symlink() {
        remove_file_or_link(path, metadata.file_type());
        return;
    }
    super::writable_directories(path);
    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return,
        Err(error) => panic!("read fixture {}: {error}", path.display()),
    };
    for entry in entries {
        let entry = entry.expect("fixture entry");
        let kind = entry.file_type().expect("fixture file type");
        if kind.is_dir() {
            remove(&entry.path());
        } else {
            remove_file_or_link(&entry.path(), kind);
        }
    }
    assert!(
        fs::read_dir(path)
            .unwrap()
            .next()
            .is_none(),
        "fixture restoration retained children",
    );
}
fn remove_file_or_link(path: &Path, kind: fs::FileType) {
    #[cfg(windows)]
    {
        use std::os::windows::fs::FileTypeExt;
        if kind.is_symlink_dir() {
            fs::remove_dir(path).expect("remove fixture directory link");
            return;
        }
    }
    #[cfg(not(windows))]
    let _ = kind;
    fs::remove_file(path).expect("remove fixture file or link");
}

#[cfg(windows)]
#[test]
fn restoring_remote_contents_preserves_a_locked_root_without_retaining_outputs() {
    use std::os::windows::fs::OpenOptionsExt;
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("remote");
    fs::create_dir_all(root.join("objects/stale")).unwrap();
    fs::write(root.join("objects/stale/data"), "obsolete").unwrap();
    fs::write(root.join("unexpected"), "effect").unwrap();
    let handle = fs::OpenOptions::new()
        .read(true)
        .share_mode(3)
        .custom_flags(0x0200_0000)
        .open(&root)
        .unwrap();
    contents(&root);
    assert!(root.is_dir());
    assert!(
        fs::read_dir(&root)
            .unwrap()
            .next()
            .is_none(),
    );
    assert_eq!(fs::remove_dir(&root).unwrap_err().raw_os_error(), Some(32));
    drop(handle);
    fs::remove_dir(&root).unwrap();
}

#[cfg(unix)]
#[test]
fn restoring_remote_contents_clears_readonly_children_without_following_links() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("remote");
    let external = temporary.path().join("external");
    fs::create_dir_all(root.join("stale")).unwrap();
    fs::create_dir(&external).unwrap();
    fs::write(root.join("stale/output"), "effect").unwrap();
    fs::write(external.join("untouched"), "external").unwrap();
    symlink(&external, root.join("external-link")).unwrap();
    fs::set_permissions(root.join("stale"), fs::Permissions::from_mode(0o555)).unwrap();
    contents(&root);
    assert!(root.is_dir());
    assert!(
        fs::read_dir(&root)
            .unwrap()
            .next()
            .is_none(),
    );
    assert_eq!(fs::read(external.join("untouched")).unwrap(), b"external");
}

#[cfg(unix)]
#[test]
fn restoring_a_remote_root_link_does_not_remove_external_children() {
    let temporary = tempfile::tempdir().unwrap();
    let target = temporary.path().join("target");
    let link = temporary.path().join("remote");
    fs::create_dir(&target).unwrap();
    fs::write(target.join("untouched"), "external").unwrap();
    std::os::unix::fs::symlink(&target, &link).unwrap();
    contents(&link);
    assert!(!link.exists());
    assert_eq!(fs::read(target.join("untouched")).unwrap(), b"external");
}

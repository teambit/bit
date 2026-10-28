//! Restored fixtures must not retain outputs when a command leaves read-only directories.
pub(super) mod remote;

use std::{fs, io, path::Path};

pub(super) fn remove(path: &Path) {
    match fs::remove_dir_all(path) {
        Ok(()) => return,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return,
        Err(error) if error.kind() == io::ErrorKind::PermissionDenied => {}
        Err(error) => panic!("remove fixture {}: {error}", path.display()),
    }
    writable_directories(path);
    fs::remove_dir_all(path).expect("remove fixture after restoring directory access");
    assert!(!path.exists(), "fixture restoration retained {}", path.display());
}

fn writable_directories(path: &Path) {
    let metadata = fs::symlink_metadata(path).expect("fixture metadata");
    if !metadata.is_dir() {
        return;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mode = metadata.permissions().mode();
        fs::set_permissions(path, fs::Permissions::from_mode(mode | 0o700)).unwrap();
    }
    for entry in fs::read_dir(path).expect("fixture directory") {
        writable_directories(&entry.unwrap().path());
    }
}

#[cfg(unix)]
#[test]
fn cleanup_removes_readonly_fixture_outputs_without_following_symlinks() {
    use std::os::unix::fs::{PermissionsExt, symlink};
    let temporary = tempfile::tempdir().unwrap();
    let root = temporary.path().join("workspace");
    let external = temporary.path().join("external");
    fs::create_dir_all(root.join("coverage")).unwrap();
    fs::create_dir(&external).unwrap();
    fs::write(root.join("coverage/report"), "report").unwrap();
    fs::write(root.join("test-side-effect"), "x").unwrap();
    fs::write(external.join("untouched"), "external").unwrap();
    symlink(&external, root.join("external-link")).unwrap();
    fs::set_permissions(root.join("coverage"), fs::Permissions::from_mode(0o555)).unwrap();
    fs::set_permissions(&external, fs::Permissions::from_mode(0o555)).unwrap();
    remove(&root);
    assert!(!root.exists());
    assert_eq!(fs::read(external.join("untouched")).unwrap(), b"external");
    assert_eq!(
        fs::metadata(&external)
            .unwrap()
            .permissions()
            .mode()
            & 0o777,
        0o555,
    );
    fs::set_permissions(&external, fs::Permissions::from_mode(0o755)).unwrap();
}

#[cfg(unix)]
#[test]
fn fake_package_does_not_modify_linked_or_hardlinked_store_files() {
    use std::os::unix::fs::symlink;
    let helper = super::Helper::new();
    let external = helper.scopes.e2e_dir.join("store");
    let package = helper.scopes.local_path.join("node_modules/react");
    fs::create_dir_all(&external).unwrap();
    fs::create_dir_all(package.parent().unwrap()).unwrap();
    fs::write(external.join("index.js"), "original").unwrap();
    fs::write(external.join("package.json"), "original metadata").unwrap();
    symlink(&external, &package).unwrap();
    helper.npm_add_fake_package("react", "18.0.0", false);
    assert_eq!(fs::read_to_string(external.join("index.js")).unwrap(), "original");
    assert_eq!(fs::read_to_string(external.join("package.json")).unwrap(), "original metadata");
    fs::remove_dir_all(&package).unwrap();
    fs::create_dir(&package).unwrap();
    fs::hard_link(external.join("index.js"), package.join("index.js")).unwrap();
    fs::hard_link(external.join("package.json"), package.join("package.json")).unwrap();
    helper.npm_add_fake_package("react", "18.0.0", false);
    assert_eq!(fs::read_to_string(external.join("index.js")).unwrap(), "original");
    assert_eq!(fs::read_to_string(external.join("package.json")).unwrap(), "original metadata");
}

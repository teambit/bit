use super::{LinkKind, create_link_or_symlink, may_link_target, remove_path};
use std::fs;

#[cfg(unix)]
mod unix;

#[cfg(windows)]
mod windows;

#[test]
fn hard_link_kind_links_a_file_that_shares_writes_with_its_source() {
    let dir = tempfile::tempdir().unwrap();
    let file = dir.path().join("package.json");
    fs::write(&file, "{}").unwrap();
    let dest = dir.path().join("injected/package.json");
    create_link_or_symlink(&file, &dest, LinkKind::HardLinkOrSymlink, false).unwrap();
    fs::write(&file, r#"{"name":"changed"}"#).unwrap();
    assert_eq!(fs::read_to_string(&dest).unwrap(), r#"{"name":"changed"}"#);
}

#[test]
fn hard_link_kind_links_a_directory_that_resolves_to_its_source() {
    let dir = tempfile::tempdir().unwrap();
    let src = dir.path().join("comps/foo");
    fs::create_dir_all(&src).unwrap();
    fs::write(src.join("index.ts"), "ts").unwrap();
    let dest = dir.path().join("node_modules/pkg/_src");
    create_link_or_symlink(&src, &dest, LinkKind::HardLinkOrSymlink, false).unwrap();
    assert!(
        fs::symlink_metadata(&dest)
            .unwrap()
            .file_type()
            .is_symlink(),
    );
    assert_eq!(fs::canonicalize(&dest).unwrap(), fs::canonicalize(&src).unwrap());
    assert_eq!(fs::read_to_string(dest.join("index.ts")).unwrap(), "ts");
}

#[test]
fn remove_path_deletes_trees_and_ignores_missing_paths() {
    let dir = tempfile::tempdir().unwrap();
    let tree = dir.path().join("tree");
    fs::create_dir_all(tree.join("nested")).unwrap();
    fs::write(tree.join("nested/file"), "x").unwrap();
    remove_path(&tree).unwrap();
    assert!(!tree.exists());
    remove_path(&tree).unwrap();
}

#[test]
fn may_link_target_refuses_real_directories_unless_installed_locally() {
    let dir = tempfile::tempdir().unwrap();
    assert!(may_link_target(&dir.path().join("missing"), false));
    assert!(!may_link_target(dir.path(), false));
    assert!(may_link_target(dir.path(), true));
}
